# IELTS Imperia — Backend

FastAPI + PostgreSQL + SQLAlchemy 2.0 (async)

## Быстрый старт

```bash
cd backend

# 1. Создать виртуальное окружение
python -m venv .venv

# 2. Активировать (Windows)
.venv\Scripts\activate

# 3. Установить зависимости
pip install -r requirements.txt

# 4. Скопировать .env и настроить
cp .env.example .env
# Открой .env и укажи свой пароль PostgreSQL

# 5. Создать базу данных (PostgreSQL должен быть запущен)
psql -U postgres -c "CREATE DATABASE ielts_imperia;"

# 6. Применить миграции
alembic upgrade head

# 7. Запустить сервер
uvicorn app.main:app --reload
```

Сервер запустится на http://127.0.0.1:8000

- Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- Health check: http://127.0.0.1:8000/health

## Тестовые данные (seed)

Из каталога `backend/` при работающей PostgreSQL и применённых миграциях:

- **`seed.py`** — полностью очищает основные таблицы (комнаты, курсы, учителя, группы, ученики, платежи, уроки, посещаемость, сессии) и вставляет большой демо-набор. Запись админа в `admin_settings` сохраняется.
- **`seed_append.py`** — **ничего не удаляет**: добавляет две демо-комнаты, двух учителей (уникальные логины вида `d<tag>_t1` / `Teacher@123`), четыре группы, учеников, платежи и посещаемость; если курсов нет — вставляет тот же канонический каталог из шести названий. По желанию создаёт менеджера `demo_manager` / `Manager@123`, если его ещё нет.

```powershell
.venv\Scripts\python.exe seed.py
.venv\Scripts\python.exe seed_append.py
```

## Стек

| Компонент | Версия |
|-----------|--------|
| FastAPI | ≥ 0.111 |
| SQLAlchemy | ≥ 2.0 (async) |
| asyncpg | ≥ 0.29 |
| Alembic | ≥ 1.13 |
| Pydantic | v2 |
| python-jose | ≥ 3.3 |
| passlib[bcrypt] | ≥ 1.7 |

## Структура

```
backend/
├── alembic/          # Миграции БД
├── app/
│   ├── main.py       # Точка входа FastAPI
│   ├── core/
│   │   ├── config.py     # Настройки (pydantic-settings)
│   │   ├── database.py   # Async engine + get_db
│   │   ├── security.py   # JWT + bcrypt
│   │   └── deps.py       # FastAPI зависимости
│   ├── models/
│   │   └── base.py       # Base + TimestampMixin
│   ├── schemas/      # Pydantic схемы
│   ├── api/v1/       # Роуты
│   └── services/     # Бизнес-логика
├── .env              # Локальные переменные (не в git)
├── .env.example      # Шаблон
├── alembic.ini
└── requirements.txt
```
