import os

import psycopg
from psycopg.rows import dict_row


DATABASE_URL = os.getenv(
    "NETATLAS_POSTGRES_URL",
    ""
)


def get_pg_connection():
    if not DATABASE_URL:
        raise RuntimeError(
            "NETATLAS_POSTGRES_URL is not configured."
        )

    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        connect_timeout=5
    )