# Keitaro Admin

Обёртка над Admin API трекера [Keitaro](https://keitaro.io). Умеет две вещи:

1. **Создаёт кампании.** Вводишь название, страны гео и ID оффера. Обёртка создаёт кампанию с доменом, группой и источником трафика и добавляет в неё два потока:
   - **Flow 1**: выбранные страны уходят редиректом на `google.com`;
   - **Flow 2**: все остальные уходят на выбранный оффер.
2. **Редактирует офферы в существующей кампании.** Логика повторяет эталонную обёртку из видео к ТЗ:
   - Добавление и удаление офферов меняет только локальный черновик. Веса пересчитываются сразу, поток помечается как «не опубликован».
   - **Опубликовать** отправляет черновик в Keitaro, **Отменить** откатывает его.
   - Удалённый оффер остаётся в архиве с кнопкой **Вернуть**.
   - **Синхронизация** подтягивает потоки из Keitaro. Офферы, которые удалили прямо в Keitaro, попадают в архив.
   - Веса можно **закрепить**. При любом изменении закреплённые доли сохраняются, а остальные активные офферы делят остаток поровну. В сумме всегда 100%.

Помимо этого есть:
- список кампаний со статистикой, фильтрами (название, оффер, гео, статус, «только созданные здесь») и скелетонами;
- редактор долей со слайдерами;
- DNS-статус домена с запасной ссылкой через хост трекера;
- автообновление и плашка о том, что потоки изменили в самом Keitaro.

**Стек:**
- бэкенд: FastAPI, async SQLAlchemy 2 (SQLite + aiosqlite), Alembic, httpx, pydantic-settings, pytest;
- фронтенд: React 18, TypeScript, Vite, Tailwind CSS v4, TanStack Query, React Router.

## Запуск

Нужны Python 3.11+ и Node.js 18+.

### 1. Конфигурация

```bash
cp .env.example .env
```

Заполни две переменные:
- `KEITARO_HOST`: адрес трекера, например `https://tracker.example`. Из него выводится адрес API: `<хост>/admin_api/v1`.
- `KEITARO_API_KEY`: API-ключ пользователя Keitaro.

Остальные переменные необязательны, пояснения есть в `.env.example`.

| Переменная | Зачем |
| --- | --- |
| `DEFAULT_DOMAIN_ID` / `DEFAULT_GROUP_ID` / `DEFAULT_TRAFFIC_SOURCE_ID` | Что ставить новым кампаниям. Если ID не задан, группа и источник ищутся по имени (`DEFAULT_GROUP_NAME`, `DEFAULT_TRAFFIC_SOURCE_NAME`) |
| `SAFE_REDIRECT_URL` | Куда редиректит Flow 1 (по умолчанию `https://google.com`) |
| `CAMPAIGN_NAME_PREFIX` | Префикс к названию создаваемых кампаний |
| `DATABASE_URL` | По умолчанию SQLite в `backend/app.db` |

### 2. Бэкенд и миграции

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt

alembic upgrade head            # создаёт или обновляет app.db
uvicorn app.main:app --port 8000 --reload
```

Swagger открывается на http://localhost:8000/docs.

**Миграции** лежат в `backend/alembic/versions`:

| Ревизия | Что делает |
| --- | --- |
| `0001_init` | Созданные кампании и история изменений офферов |
| `0002_drafts` | Отслеживаемые потоки и их офферы: черновик, опубликованный снимок (`kt_present`, `kt_share`), статус, пин |
| `0003_restored_flag` | Флаг `restored` для офферов, возвращённых из архива в черновик |

После каждого `git pull` запускай `alembic upgrade head`. Новая миграция после правки `app/models.py` создаётся так:

```bash
alembic revision --autogenerate -m "описание"
```

### 3. Фронтенд

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Vite проксирует `/api` на `http://localhost:8000`. Прод-сборка: `npm run build`, результат в `frontend/dist`.

### 4. Тесты

```bash
cd backend
pytest
```

Тесты не ходят в настоящий Keitaro: клиент подменяется фейком в памяти (`tests/conftest.py`). Покрыты:
- создание кампании;
- черновой цикл редактора;
- пересчёт весов с закреплёнными долями;
- синхронизация и обнаружение изменений, сделанных в Keitaro.

## Как устроено

```
фронтенд (React) → /api/* → FastAPI → services → KeitaroClient (httpx) → Keitaro Admin API
                                               ↘ SQLAlchemy → SQLite (черновики, архив, история)
```

- **`backend/app/keitaro/client.py`**: тонкий клиент Admin API с заголовком `Api-Key`. Работает с кампаниями, потоками, офферами, доменами, группами, источниками и отчётами.
- **`backend/app/services/campaigns.py`**: создание кампании (сначала кампания, затем Flow 1 `forced` и Flow 2 `regular` с оффером) и список кампаний со статистикой.
- **`backend/app/services/editor.py`**: редактор. Черновик хранится в БД:
  - у каждого оффера в потоке есть доля черновика и снимок того, что опубликовано в Keitaro (`kt_present`, `kt_share`);
  - статус «добавлен / удалён / изменён» вычисляется по разнице между ними;
  - перед публикацией бэкенд проверяет, что поток в Keitaro не менялся с последней синхронизации, иначе возвращает 409.
- **`backend/app/services/shares.py`**: пересчёт весов. Закреплённые доли сохраняются, остаток делится поровну и округляется методом наибольших остатков.
- **`backend/app/services/tracking.py`**: синхронизация потоков из Keitaro в БД, включая перенос удалённых офферов в архив.

### Основные эндпоинты

| Метод | Путь | Что делает |
| --- | --- | --- |
| `POST` | `/api/campaigns` | Создать кампанию с двумя потоками |
| `GET` | `/api/campaigns` | Список кампаний со статистикой |
| `GET` | `/api/campaigns/{id}` | Детали кампании, потоки и черновик офферов |
| `POST` | `/api/campaigns/{id}/sync` | Подтянуть потоки из Keitaro |
| `POST` / `DELETE` | `/api/campaigns/{id}/streams/{sid}/offers[/{oid}]` | Добавить или удалить оффер в черновике |
| `POST` | `…/offers/{oid}/restore` | Вернуть оффер из архива |
| `PUT` / `PATCH` | `…/offers`, `…/offers/{oid}` | Задать доли / закрепить оффер |
| `POST` | `…/streams/{sid}/publish`, `…/discard` | Опубликовать черновик в Keitaro / откатить |
| `GET` | `/api/refs/offers/{id}` | Проверить, что оффер с таким ID существует |

## Демо

Скринкаст лежит в [`demo/out/demo.mp4`](demo/out/demo.mp4). Его записывает Playwright-скрипт, как его запустить, описано в [`demo/README.md`](demo/README.md).

## Структура

```
backend/
  app/            FastAPI: api/, services/, keitaro/, models.py, schemas.py, config.py
  alembic/        миграции
  tests/          pytest и фейковый Keitaro
frontend/
  src/            pages/, components/, api/, lib/shares.ts
demo/             Playwright-скринкаст
```
