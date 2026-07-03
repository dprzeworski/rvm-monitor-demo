# RVM Monitor

Aplikacja webowa do monitorowania sieci automatów do zwrotu opakowań (RVM) w skali ~2400 urządzeń, zintegrowana z zewnętrznymi systemami API oraz systemem zgłoszeń serwisowych.

## Opis

RVM Monitor centralizuje dane o statusie i dostępności automatów zwrotu opakowań, dostarczając zespołowi IT jednego miejsca do monitorowania stanu urządzeń, historii przestojów oraz statusu zgłoszeń serwisowych powiązanych z konkretnymi maszynami.

## Kluczowe funkcje

- **Statystyki dostępności** – codzienne migawki stanu urządzeń, śledzenie przejść offline/online, dedykowany widok urządzeń niedostępnych 24h+ z filtrowaniem po dacie i statusie
- **Eksport danych** – eksport raportów do formatu XLSX
- **Obsługa urządzeń zdemontowanych** – automatyczne wykluczanie zdemontowanych urządzeń z liczników i statystyk na podstawie danych z zewnętrznego API
- **Integracja z systemem zgłoszeń serwisowych** – automatyczna synchronizacja statusu i rozwiązania zgłoszeń powiązanych z urządzeniami
- **Panel administracyjny** – role użytkowników (admin/user/viewer)

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

## Autor

Damian Przeworski – [linkedin.com/in/damian-przeworski-78046a223](https://linkedin.com/in/damian-przeworski-78046a223)
