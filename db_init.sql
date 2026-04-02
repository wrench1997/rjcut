-- FILE: /root/workspaces/rjcut/db_init.sql

-- ============================================================
-- 商户表
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
    id              SERIAL PRIMARY KEY,
    merchant_id     VARCHAR(64)  NOT NULL UNIQUE,
    name            VARCHAR(256) NOT NULL,
    status          VARCHAR(32)  NOT NULL DEFAULT 'active',   -- active / suspended / deleted
    api_key_hash    VARCHAR(256) NOT NULL,                    -- sha256(api_key)
    api_key_prefix  VARCHAR(16)  NOT NULL,                    -- 前8位用于快速查找
    quota_total     INTEGER      NOT NULL DEFAULT 100,        -- 总配额(任务数)
    quota_used      INTEGER      NOT NULL DEFAULT 0,          -- 已用配额
    rate_limit_rpm  INTEGER      NOT NULL DEFAULT 10,         -- 每分钟请求上限
    balance_cents   BIGINT       NOT NULL DEFAULT 0,          -- 余额(分)
    pricing_cents   INTEGER      NOT NULL DEFAULT 100,        -- 每任务单价(分)
    callback_url    VARCHAR(1024),
    callback_secret VARCHAR(256),
    metadata_json   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_api_key_prefix ON merchants(api_key_prefix);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);

-- ============================================================
-- 任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
    id              SERIAL PRIMARY KEY,
    task_id         VARCHAR(64)  NOT NULL UNIQUE,
    merchant_id     VARCHAR(64)  NOT NULL,
    type            VARCHAR(64)  NOT NULL DEFAULT 'agent_compose',
    status          VARCHAR(32)  NOT NULL DEFAULT 'queued',
    progress        INTEGER      NOT NULL DEFAULT 0,
    stage           VARCHAR(128),
    priority        INTEGER      NOT NULL DEFAULT 0,
    celery_task_id  VARCHAR(256),
    payload_json    TEXT,
    result_json     TEXT,
    error           TEXT,
    cost_cents      INTEGER      NOT NULL DEFAULT 0,
    timeout_at      TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    client_ref_id   VARCHAR(256),
    trace_id        VARCHAR(128),

    CONSTRAINT fk_tasks_merchant FOREIGN KEY (merchant_id)
        REFERENCES merchants(merchant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_merchant_id ON tasks(merchant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_timeout_at ON tasks(timeout_at) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_tasks_celery_task_id ON tasks(celery_task_id);

-- ============================================================
-- 文件记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS task_files (
    id              SERIAL PRIMARY KEY,
    task_id         VARCHAR(64)  NOT NULL,
    file_key        VARCHAR(128) NOT NULL,
    s3_bucket       VARCHAR(128) NOT NULL,
    s3_key          VARCHAR(512) NOT NULL,
    file_name       VARCHAR(256),
    mime_type       VARCHAR(128) DEFAULT 'application/octet-stream',
    file_size       BIGINT,
    checksum_sha256 VARCHAR(128),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_files_task FOREIGN KEY (task_id)
        REFERENCES tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT uq_task_file_key UNIQUE (task_id, file_key)
);

CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id);

-- ============================================================
-- 计费流水表
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_records (
    id              SERIAL PRIMARY KEY,
    merchant_id     VARCHAR(64)  NOT NULL,
    task_id         VARCHAR(64),
    type            VARCHAR(32)  NOT NULL,  -- charge / refund / topup
    amount_cents    BIGINT       NOT NULL,
    balance_after   BIGINT       NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_billing_merchant FOREIGN KEY (merchant_id)
        REFERENCES merchants(merchant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_billing_merchant_id ON billing_records(merchant_id);

-- ============================================================
-- 插入默认测试商户
-- ============================================================
INSERT INTO merchants (merchant_id, name, api_key_hash, api_key_prefix, quota_total, balance_cents, pricing_cents)
VALUES (
    'mch_default_001',
    '默认测试商户',
    -- sha256 of 'sk-rjcut-prod-001'
    encode(sha256('sk-rjcut-prod-001'::bytea), 'hex'),
    'sk-rjcut',
    10000,
    10000000,   -- 100000 元 = 10000000 分
    100         -- 1 元/任务
)
ON CONFLICT (merchant_id) DO NOTHING;

INSERT INTO merchants (merchant_id, name, api_key_hash, api_key_prefix, quota_total, balance_cents, pricing_cents)
VALUES (
    'mch_default_002',
    '第二测试商户',
    encode(sha256('sk-rjcut-prod-002'::bytea), 'hex'),
    'sk-rjcut',
    500,
    500000,
    200
)
ON CONFLICT (merchant_id) DO NOTHING;