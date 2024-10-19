-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Počítač: 127.0.0.1
-- Vytvořeno: Sob 19. říj 2024, 02:42
-- Verze serveru: 10.4.32-MariaDB
-- Verze PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Databáze: `db_facebook_users`
--

-- --------------------------------------------------------

--
-- Struktura tabulky `published_articles`
--

CREATE TABLE `published_articles` (
  `id` int(11) NOT NULL,
  `guid` varchar(255) NOT NULL,
  `pub_date` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Vypisuji data pro tabulku `published_articles`
--

INSERT INTO `published_articles` (`id`, `guid`, `pub_date`, `created_at`) VALUES
(59, 'https://cibulka-demo.antee.cz/aktuality/test-1', '2024-10-19 02:12:04', '2024-10-19 00:12:04'),
(60, 'https://cibulka-demo.antee.cz/aktuality/test-2', '2024-10-19 02:13:10', '2024-10-19 00:13:10'),
(61, 'https://cibulka-demo.antee.cz/aktuality/test-3', '2024-10-19 02:15:30', '2024-10-19 00:15:30'),
(62, 'https://cibulka-demo.antee.cz/aktuality/test-4', '2024-10-19 02:16:29', '2024-10-19 00:16:29'),
(63, 'https://cibulka-demo.antee.cz/aktuality/test-5', '2024-10-19 02:18:30', '2024-10-19 00:18:30');

-- --------------------------------------------------------

--
-- Struktura tabulky `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `rss_url` varchar(255) NOT NULL,
  `facebook_user_id` varchar(255) NOT NULL,
  `short_user_access_token` text NOT NULL,
  `long_user_access_token` text DEFAULT NULL,
  `facebook_page_id` varchar(255) DEFAULT NULL,
  `page_access_token` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `data_access_expires_at` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Vypisuji data pro tabulku `users`
--

INSERT INTO `users` (`id`, `rss_url`, `facebook_user_id`, `short_user_access_token`, `long_user_access_token`, `facebook_page_id`, `page_access_token`, `created_at`, `updated_at`, `data_access_expires_at`) VALUES
(11, 'https://cibulka-demo.antee.cz/aktuality?action=atom', '122146064738294843', 'EAAgietpVCsQBO7CajkPxOk8Iz36w1va18q116KwEjdro4WTYSF596aFBCpamN2T6YXekgTu5krAOQhuxgV6zivo4vUbVBUEdv2MUQQo3cwetG6NCNUcSxun4qeeo5p0f1yDqaVtPlnK2RpuH0t6veIYH5ZBXkPbF43TnqZCuxLJc8R0lMSaTY40wT5erZAGZCdvPG5AJaqaentqaVgZDZD', 'EAAgietpVCsQBO9lWbZCe5Q7QQj2nZCO1y1sIwhu3qyl71Lut2XCpEcZBZB5PJeRqGjQIbNNyqYij08lT6rBdilEB9C7hAnZBqw3qqvsmzOQlpgJz93QJpT5U0cXAFdbC9i9igpAfdr6YfjbFS30KwvZAMsma3DZBIMEBQ0hhaRoswWbsjqtbmiXT1C5', '293538737177895', 'EAAgietpVCsQBOZCtqmWGWBnEoNWx3fZBoYYxTpA3HSvlobm2FDptCjyx3ZAy8SLk9RdL46r8lDLGSYKfH9cknrnGREnQcTW9vN8tRz6mtEnF7bUsKTYXe57NOW9JaJZBwR98bmcBD9GriPcksM4vvnGY49MfNMGrDy6V97VZCQtrP4QxORQ08KChwVs7OJWew', '2024-10-18 11:09:55', '2024-10-18 23:30:01', 1737070198);

--
-- Indexy pro exportované tabulky
--

--
-- Indexy pro tabulku `published_articles`
--
ALTER TABLE `published_articles`
  ADD PRIMARY KEY (`id`);

--
-- Indexy pro tabulku `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT pro tabulky
--

--
-- AUTO_INCREMENT pro tabulku `published_articles`
--
ALTER TABLE `published_articles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=64;

--
-- AUTO_INCREMENT pro tabulku `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
