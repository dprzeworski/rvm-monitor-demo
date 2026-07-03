# RVM Monitor

Aplikacja webowa wspierająca monitorowanie infrastruktury ponad 2400 automatów do zwrotu opakowań (RVM), zintegrowana z zewnętrznymi systemami oraz platformą zgłoszeń serwisowych.

## Opis

Celem projektu było skrócenie czasu potrzebnego do diagnostyki problemów oraz zebranie rozproszonych informacji w jednym miejscu.

## Kluczowe funkcje

- **Statystyki dostępności** – codzienne migawki stanu urządzeń, śledzenie przejść offline/online, dedykowany widok urządzeń pozostających offline przez ponad 24 godziny
- **Eksport danych** – eksport raportów do formatu XLSX
- **Obsługa urządzeń zdemontowanych** – automatyczne wykluczanie zdemontowanych urządzeń z liczników i statystyk na podstawie danych z zewnętrznego API
- **Integracja z systemem zgłoszeń serwisowych** – automatyczna synchronizacja statusu i rozwiązania zgłoszeń powiązanych z urządzeniami
- **Panel administracyjny** – zarządzanie rolami użytkowników (Administrator / User / Viewer)

## Stos technologiczny

**Backend:**
- Node.js + Express
- SQLite (better-sqlite3, tryb WAL)
- REST API

**Frontend:**
- React 18
- Chart.js – wizualizacja danych
- SheetJS (xlsx) – eksport danych
- Lucide Icons – ikonografia

**Infrastruktura:**
- Serwer Linux, systemd
- Wdrożenie bez build-toolchainu (biblioteki serwowane lokalnie)

## Architektura

Aplikacja pobiera dane cyklicznie z zewnętrznego API dostawcy urządzeń oraz z systemu zgłoszeń serwisowych (REST API v3), zapisuje je lokalnie w SQLite i udostępnia poprzez własne REST API konsumowane przez frontend React.

## Status projektu

Projekt aktywnie rozwijany od marca 2026, w bieżącym użyciu produkcyjnym.

## Uwaga

To repozytorium prezentuje wybrane fragmenty kodu jako demo umiejętności. Ze względu na dane firmowe (adresy wewnętrzne, klucze API, dane produkcyjne) pełny kod źródłowy nie jest publikowany w całości.

## Informacja

Projekt został zrealizowany z wykorzystaniem narzędzi AI wspomagających proces tworzenia oprogramowania. Autor odpowiadał za analizę wymagań, projekt architektury, integrację systemów, wdrożenie oraz rozwój aplikacji.

## Autor

Damian Przeworski – [linkedin.com/in/damian-przeworski-78046a223](https://linkedin.com/in/damian-przeworski-78046a223)
