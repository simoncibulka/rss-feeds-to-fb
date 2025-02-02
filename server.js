require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const Parser = require('rss-parser');
const FormData = require('form-data');
const cheerio = require('cheerio');
const { parse, addHours, isAfter } = require('date-fns');
const parser = new Parser();
const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Připojení k MySQL databázi
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});
db.connect((err) => {
    if (err) throw err;
    console.log(`[${formatDateTime()}] Připojeno k MySQL`);
});

// Endpoint pro ukládání uživatelských dat a získání long-lived page access tokenu
app.post('/save-user-data', async (req, res) => {
    const {rss_url, facebook_user_id, short_user_access_token} = req.body;

    if (!rss_url || !facebook_user_id || !short_user_access_token) {
        return res.status(400).json({status: 'error', message: 'Chybí potřebná data'});
    }

    try {
        // Získání long-lived user access tokenu
        const longUserAccessToken = await getLongLivedToken(short_user_access_token);

        // Získání page access tokenu a page ID
        const {pageAccessToken, pageId, dataAccessExpiresAt} = await getPageAccessToken(longUserAccessToken);

        // Zkontrolujeme, zda uživatel již existuje v databázi
        const checkUserQuery = `SELECT *
                                FROM users
                                WHERE facebook_user_id = ?`;
        db.query(checkUserQuery, [facebook_user_id], (err, result) => {
            if (err) {
                console.error(`[${formatDateTime()}] Chyba při kontrole uživatele:`, err);
                return res.status(500).json({
                    status: 'error',
                    message: `[${formatDateTime()}] Chyba při kontrole uživatele.`
                });
            }

            const userData = [rss_url, short_user_access_token, longUserAccessToken, pageAccessToken, pageId, dataAccessExpiresAt, facebook_user_id];

            if (result.length > 0) {
                // Aktualizujeme uživatele, pokud již existuje
                const updateUserQuery = `UPDATE users
                                         SET rss_url                 = ?,
                                             short_user_access_token = ?,
                                             long_user_access_token  = ?,
                                             page_access_token       = ?,
                                             facebook_page_id        = ?,
                                             data_access_expires_at  = ?
                                         WHERE facebook_user_id = ?`;
                db.query(updateUserQuery, userData, (err, result) => {
                    if (err) {
                        console.error(`[${formatDateTime()}] Chyba při aktualizaci uživatele:`, err);
                        return res.status(500).json({
                            status: 'error',
                            message: `[${formatDateTime()}] Chyba při aktualizaci uživatele.`
                        });
                    }
                    res.json({status: 'success', message: `[${formatDateTime()}] Uživatel a tokeny aktualizovány.`});
                });
            } else {
                // Vložíme nového uživatele
                const insertUserQuery = `INSERT INTO users (rss_url, short_user_access_token, long_user_access_token,
                                                            page_access_token, facebook_page_id, data_access_expires_at,
                                                            facebook_user_id)
                                         VALUES (?, ?, ?, ?, ?, ?, ?)`;
                db.query(insertUserQuery, userData, (err, result) => {
                    if (err) {
                        console.error(`[${formatDateTime()}] Chyba při vkládání uživatele:`, err);
                        return res.status(500).json({
                            status: 'error',
                            message: `[${formatDateTime()}] Chyba při vkládání uživatele.`
                        });
                    }
                    res.json({status: 'success', message: 'Nový uživatel a tokeny uloženy.'});
                });
            }
        });
    } catch (error) {
        console.error(`[${formatDateTime()}] Chyba při ukládání uživatelských dat a tokenů:`, error);
        return res.status(500).json({
            status: 'error',
            message: `[${formatDateTime()}] Chyba při ukládání uživatelských dat a tokenů.`
        });
    }
});

// Endpoint pro reautorizaci a aktualizaci tokenů
app.post('/update-tokens', async (req, res) => {
    const {facebook_user_id, new_short_user_access_token} = req.body;

    try {
        // Získání nového long-lived user access tokenu
        const longUserAccessToken = await getLongLivedToken(new_short_user_access_token);

        // Získání nového page access tokenu a ID
        const {pageAccessToken, pageId, dataAccessExpiresAt} = await getPageAccessToken(longUserAccessToken);

        // Aktualizace tokenů v databázi
        const updateTokensQuery = `UPDATE users
                                   SET short_user_access_token = ?,
                                       long_user_access_token  = ?,
                                       page_access_token       = ?,
                                       data_access_expires_at  = ?
                                   WHERE facebook_user_id = ?`;
        db.query(updateTokensQuery, [new_short_user_access_token, longUserAccessToken, pageAccessToken, dataAccessExpiresAt, facebook_user_id], (err, result) => {
            if (err) {
                console.error(`[${formatDateTime()}] Chyba při aktualizaci tokenů v databázi:`, err);
                return res.status(500).json({status: 'error', message: 'Chyba při aktualizaci tokenů v databázi.'});
            }
            res.json({status: 'success', message: 'Tokeny byly úspěšně aktualizovány.'});
        });
    } catch (error) {
        console.error(`[${formatDateTime()}] Chyba při aktualizaci tokenů:`, error);
        return res.status(500).json({status: 'error', message: 'Chyba při aktualizaci tokenů.'});
    }
});

// Funkce pro získání Long-Lived User Access Tokenu
async function getLongLivedToken(shortUserAccessToken) {
    const appId = process.env.APP_ID;
    const appSecret = process.env.APP_SECRET;

    const url = `https://graph.facebook.com/v12.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortUserAccessToken}`;

    try {
        const response = await axios.get(url);
        if (response.data && response.data.access_token) {
            const longLivedUserToken = response.data.access_token;
            console.log(`[${formatDateTime()}] Dlouhý uživatelský token získán: ${longLivedUserToken}`);
            return longLivedUserToken;
        } else {
            throw new Error(`[${formatDateTime()}] Nepodařilo se získat dlouhý token.`);
        }
    } catch (error) {
        console.error(`[${formatDateTime()}] Chyba při získávání dlouhého tokenu:`, error);
        throw error;
    }
}

// Funkce pro získání Page Access Tokenu, Page ID a data_access_expires_at
async function getPageAccessToken(longLivedUserToken) {
    try {
        const appId = process.env.APP_ID;
        const appSecret = process.env.APP_SECRET;
        const debugUrl = `https://graph.facebook.com/debug_token?input_token=${longLivedUserToken}&access_token=${appId}|${appSecret}`;

        // Volání Facebook debug_token pro získání data expirace
        const debugResponse = await axios.get(debugUrl);
        const dataAccessExpiresAt = debugResponse.data.data.data_access_expires_at;

        const url = `https://graph.facebook.com/v12.0/me/accounts?access_token=${longLivedUserToken}`;
        const response = await axios.get(url);

        if (response.data.data && response.data.data.length > 0) {
            const pageAccessToken = response.data.data[0].access_token;
            const pageId = response.data.data[0].id;

            console.log(`[${formatDateTime()}] Page Access Token získán: ${pageAccessToken}`);
            //data_access_expires_at se ukládá ve formánu unix timestampu, pro přečtení je potřeba ho převést na čitelné datum
            console.log(`[${formatDateTime()}] Data Access vyprší: ${new Date(dataAccessExpiresAt * 1000).toLocaleString()}`);

            return {pageAccessToken, pageId, dataAccessExpiresAt};
        } else {
            throw new Error(`[${formatDateTime()}] Uživatel nespravuje žádné stránky.`);
        }
    } catch (error) {
        console.error(`[${formatDateTime()}] Chyba při získávání Page Access Tokenu:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

// Funkce pro nahrání obrázku na Facebook stránku (bez publikování)
async function uploadImageToFacebook(pageAccessToken, pageId, imageUrl) {
    try {
        console.log(`[${formatDateTime()}] Nahrávám obrázek:`, imageUrl);

        // Stáhneme obrázek pomocí axios
        const imageResponse = await axios({
            url: imageUrl,
            responseType: 'stream'
        });

        // Vytvoříme formData pro nahrání obrázku
        const formData = new FormData();
        formData.append('source', imageResponse.data);
        formData.append('published', 'false');  // Zajistí, že obrázek nebude publikován
        formData.append('access_token', pageAccessToken);

        const uploadUrl = `https://graph.facebook.com/v12.0/${pageId}/photos`;

        // Nahrajeme obrázek na Facebook stránku
        const uploadResponse = await axios.post(uploadUrl, formData, {
            headers: formData.getHeaders()  // Nastaví správné hlavičky pro formData
        });

        console.log(`[${formatDateTime()}] Obrázek úspěšně nahrán:`, uploadResponse.data);
        return uploadResponse.data.id; // Vrátíme ID nahraného obrázku
    } catch (error) {
        console.error(`[${formatDateTime()}] Chyba při nahrávání obrázku na Facebook:`, error.response ? error.response.data : error.message);
        return null;
    }
}

// Funkce pro publikaci příspěvku s obrázkem
async function postToFacebookWithImage(pageAccessToken, message, pageId, imageId) {
    const url = `https://graph.facebook.com/v12.0/${pageId}/feed`;
    try {
        const postData = {
            message: message,
            access_token: pageAccessToken,
            attached_media: [{media_fbid: imageId}]  // Použijeme attached_media s ID obrázku
        };

        const response = await axios.post(url, postData);
        console.log(`[${formatDateTime()}] Příspěvek s obrázkem úspěšně publikován:`, response.data);
        return true;
    } catch (error) {
        console.error(`[${formatDateTime()}] Chyba při publikování příspěvku s obrázkem:`, error.response ? error.response.data : error.message);
        return false;
    }
}

// Funkce pro publikování článků (bez obrázku) na Facebook
async function postToFacebook(pageAccessToken, message, pageId) {
    const url = `https://graph.facebook.com/v12.0/${pageId}/feed`;
    try {
        const postData = {
            message: message,
            access_token: pageAccessToken
        };

        const response = await axios.post(url, postData);
        console.log(`[${formatDateTime()}] Článek úspěšně publikován na Facebook.`);
        return true;
    } catch (error) {
        console.error(`[${formatDateTime()}] Chyba při publikování na Facebook:`, error.response ? error.response.data : error.message);
        return false;
    }
}

// Funkce pro zpracování RSS feedu a publikaci článků na Facebook
async function processRSSFeed(rssUrl, pageAccessToken, pageId, facebookUserId) {
    try {
        const domain = extractDomainFromRSSUrl(rssUrl);

        // Získání created_at uživatele z databáze
        const getUserCreatedAtQuery = `SELECT created_at FROM users WHERE facebook_user_id = ? LIMIT 1`;
        const userCreatedAtResult = await new Promise((resolve, reject) => {
            db.query(getUserCreatedAtQuery, [facebookUserId], (err, result) => {
                if (err) {
                    console.error(`[${formatDateTime()}] Chyba při získávání created_at pro uživatele:`, err);
                    return reject(err);
                }
                resolve(result);
            });
        });

        if (userCreatedAtResult.length === 0) {
            console.error(`[${formatDateTime()}] Uživatel s facebook_user_id ${facebookUserId} nebyl nalezen.`);
            return;
        }

        // Převedeme created_at na objekt Date a přidáme 2 hodiny
        let userCreatedAt = new Date(userCreatedAtResult[0].created_at);
        userCreatedAt = addHours(userCreatedAt, 2);

        // Načtení RSS feedu
        const feed = await parser.parseURL(rssUrl);

        for (const item of feed.items) {
            const title = item.title;
            const description = cleanHTMLContent(item.content || item.contentSnippet);
            const guid = item.guid || `${domain}${item.link}`;

            let pubDate;
            try {
                // Převedeme pubDate pomocí date-fns a přidáme 2 hodiny
                pubDate = parse(item.pubDate, 'EEE, dd MMM yyyy HH:mm:ss xx', new Date());
                pubDate = addHours(pubDate, 2);
                if (isNaN(pubDate)) {
                    console.warn(`[${formatDateTime()}] Chyba při parsování pubDate pro článek "${title}". Datum přeskočeno.`);
                    continue;
                }

                // Publikace pouze článků s novějším datem než datum registrace uživatele
                if (!isAfter(pubDate, userCreatedAt)) {
                    console.log(`[${formatDateTime()}] Článek "${title}" je starší než datum registrace uživatele (${domain}), přeskočeno.`);
                    continue;
                }
            } catch (dateParseError) {
                console.error(`[${formatDateTime()}] Chyba při parsování pubDate pro článek "${title}":`, dateParseError.message);
                continue;
            }

            // Kontrola, zda článek již nebyl publikován (podle GUID)
            const checkQuery = `SELECT * FROM published_articles WHERE guid = ?`;
            await new Promise((resolve, reject) => {
                db.query(checkQuery, [guid], async (err, result) => {
                    if (err) {
                        console.error(`[${formatDateTime()}] Chyba při kontrole publikovaného článku:`, err);
                        return reject(err);
                    }

                    if (result.length === 0) {
                        // Článek ještě nebyl publikován, můžeme pokračovat s publikací
                        let imageId = null;
                        let errorOccurred = false;

                        if (item.enclosure && item.enclosure.url) {
                            try {
                                imageId = await uploadImageToFacebook(pageAccessToken, pageId, item.enclosure.url);
                            } catch (uploadError) {
                                console.error(`[${formatDateTime()}] Chyba při nahrávání obrázku na Facebook:`, uploadError);
                                errorOccurred = true;
                            }
                        } else {
                            // Extrahování obrázku z textového formátu a složení finální URL obrázku por nahrání
                            const imageSrc = constructImageUrlFromContent(item.content);
                            if (imageSrc) {
                                try {
                                    imageId = await uploadImageToFacebook(pageAccessToken, pageId, imageSrc);
                                } catch (uploadError) {
                                    console.error(`[${formatDateTime()}] Chyba při nahrávání obrázku na Facebook:`, uploadError);
                                    errorOccurred = true;
                                }
                            }
                        }

                        const message = `${title}\n\n${description}`;
                        let published = false;

                        // Pokud nedošlo k chybě při nahrávání obrázku nebo žádný obrázek není, pokračujeme
                        if (!errorOccurred) {
                            try {
                                if (imageId) {
                                    published = await postToFacebookWithImage(pageAccessToken, message, pageId, imageId);
                                } else {
                                    published = await postToFacebook(pageAccessToken, message, pageId);
                                }
                            } catch (postError) {
                                console.error(`[${formatDateTime()}] Chyba při publikaci článku "${title}":`, postError);
                                return reject(postError);
                            }

                            if (published) {
                                // Pokud publikace proběhla úspěšně, uložíme článek do databáze
                                const insertQuery = `INSERT INTO published_articles (guid, pub_date, created_at) VALUES (?, ?, ?)`;

                                // Převod `pubDate` na SQL formát DATETIME
                                const formattedPubDate = pubDate.toISOString().slice(0, 19).replace('T', ' ');

                                // Přidání aktuálního času pro `created_at`
                                const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

                                await new Promise((resolveInsert, rejectInsert) => {
                                    db.query(insertQuery, [guid, formattedPubDate, createdAt], (insertErr) => {
                                        if (insertErr) {
                                            console.error(`[${formatDateTime()}] Chyba při ukládání publikovaného článku do databáze:`, insertErr);
                                            return rejectInsert(insertErr);
                                        }
                                        console.log(`[${formatDateTime()}] Článek "${title}" úspěšně uložen do databáze.`);
                                        resolveInsert();
                                    });
                                });
                            } else {
                                console.log(`[${formatDateTime()}] Publikace článku "${title}" selhala, článek nebyl uložen.`);
                            }
                        } else {
                            console.log(`[${formatDateTime()}] Publikace článku "${title}" selhala kvůli chybě při nahrávání obrázku.`);
                        }
                    } else {
                        // Pokud článek již existuje, přeskočíme publikaci
                        console.log(`[${formatDateTime()}] Článek "${title}" již byl publikován, přeskočeno.`);
                    }
                    resolve();
                });
            });
        }
    } catch (error) {
        console.error(`[${formatDateTime()}] Chyba při zpracování RSS feedu:`, error.message);
    }
}

// Funkce pro extrakci hodnot nid a oid z obsahu a sestavení URL obrázku
function constructImageUrlFromContent(content) {
    const nidMatch = content.match(/nid=(\d+)/);
    const oidMatch = content.match(/oid=(\d+)/);

    if (nidMatch && oidMatch) {
        const nid = nidMatch[1];
        const oid = oidMatch[1];
        return `https://cibulka-demo.antee.cz/file.php?nid=${nid}&oid=${oid}`;
    }

    return null;
}

// Funkce pro čištění HTML obsahu, ponechává pouze text a obrázky
function cleanHTMLContent(content) {
    const $ = cheerio.load(content);

    // Zbavíme se všech atributů kromě "src" u obrázků
    $('*').each(function () {
        if ($(this).is('img')) {
            // Ponecháme obrázek s "src" atributem
            $(this).attr('src');
        } else {
            // Ostatní tagy převedeme na jejich textový obsah
            $(this).replaceWith($(this).text());
        }
    });

    // Nahrazení `&nbsp;` a dalších
    let cleanText = $.html();
    cleanText = cleanText.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

    return cleanText;
}

// Funkce pro formátování aktuálního data a času s přidáním 2 hodin
function formatDateTime() {
    const now = new Date();
    now.setHours(now.getHours() + 2); // Přidání 2 hodin
    return now.toISOString().replace('T', ' ').substring(0, 19); // formát YYYY-MM-DD HH:MM:SS
}

app.get('/reautorizace', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reautorizace.html'));
});


// Funkce pro získání domény z RSS URL
function extractDomainFromRSSUrl(rssUrl) {
    try {
        if (!rssUrl || typeof rssUrl !== 'string') {
            throw new Error('RSS URL je neplatná nebo nedefinovaná.');
        }
        const url = new URL(rssUrl);
        return url.hostname;  // Extrahuje hostname z URL (např. cibulka-demo.antee.cz)
    } catch (error) {
        console.error('Chyba při extrahování domény z RSS URL:', error.message);
        return 'neznámá doména';
    }
}

// Funkce pro kontrolu expirace data_access_expires_at
function checkDataAccessExpiration() {
    const query = `SELECT facebook_user_id, rss_url, data_access_expires_at
                   FROM users`;

    db.query(query, (err, users) => {
        if (err) {
            console.error(`[${formatDateTime()}] Chyba při načítání uživatelů z databáze:`, err);
            return;
        }

        const currentTime = Math.floor(Date.now() / 1000); // Aktuální čas v UNIX timestampu
        const daysBeforeExpiration = 10; // Počet dní před expirací, kdy upozornit uživatele
        const timeBeforeExpiration = currentTime + (daysBeforeExpiration * 24 * 60 * 60); // Počet sekund před expirací

        for (const user of users) {
            const rssUrl = user.rss_url; // Získáme RSS URL pro každého uživatele
            const domain = extractDomainFromRSSUrl(rssUrl); // Extrahujeme doménu z RSS URL

            if (user.data_access_expires_at && user.data_access_expires_at <= timeBeforeExpiration) {
                //const reauthorizeUrl = `http://${domain}/reautorizace`;

                console.log(`[${formatDateTime()}] Data Access pro uživatele - ${domain}, vyprší za méně než ${daysBeforeExpiration} dní.`);
                //tady odkaz na reakutorizaci upravit do formátu http://${domain}/reautorizace
                console.log(`[${formatDateTime()}] Klikněte zde pro reautorizaci uživatele - ${domain}: http://localhost:3000/reautorizace?user_id=${user.facebook_user_id}`);

                // Zde by se mohla poslat uživateli notifikace na email (nodemailer) a skrz odkaz by ho to přesměrovalo na reakutorizaci
                //potřeba uložit email do DB, lze ziskat z prvotního prihlaseni, url reautorizace by se dala ziskat tak,
                // že by se z url rss feedu vzala domena a pridal by se k ni odkaz na reautorizaci viz zakomentovana promenna reauthorizeUrl
            }
        }
    });
}

// Cron pro kontrolu expirace data_access_expires_at
cron.schedule('*/20 * * * * *', () => {
    console.log(`[${formatDateTime()}] CRON: Kontrola expirace data_access_expires_at...`);
    checkDataAccessExpiration();
});

// Cron pro zpracování RSS feedu a publikaci článků
cron.schedule('*/20 * * * * *', () => {
    console.log(`[${formatDateTime()}] CRON: Spouštím kontrolu a publikaci nových článků z RSS feedu...`);

    // Získáme uživatele z databáze, pro které publikujeme články
    const query = `SELECT rss_url, page_access_token, facebook_page_id, facebook_user_id FROM users`;

    db.query(query, (err, users) => {
        if (err) {
            console.error(`[${formatDateTime()}] Chyba při načítání uživatelů z databáze:`, err);
            return;
        }

        // Pro každého uživatele spustíme zpracování jeho RSS feedu
        users.forEach(user => {
            // Zkontrolujeme, zda má uživatel platný RSS URL, access token, page ID a user ID
            if (user.rss_url && user.page_access_token && user.facebook_page_id && user.facebook_user_id) {
                console.log(`[${formatDateTime()}] Zpracovávám RSS feed pro uživatele: ${user.rss_url}`);
                processRSSFeed(user.rss_url, user.page_access_token, user.facebook_page_id, user.facebook_user_id);
            } else {
                console.log(`[${formatDateTime()}] Uživatel nemá platné údaje pro publikaci: ${user.rss_url}`);
            }
        });
    });
});


// Spuštění serveru
app.listen(3000, () => {
    console.log(`[${formatDateTime()}] Server běží na http://localhost:3000`);
});