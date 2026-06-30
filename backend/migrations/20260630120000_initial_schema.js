exports.up = async function (knex) {
  await knex.schema.createTable('vendor_general_setup', (t) => {
    t.increments('id').primary();
    t.integer('default_check_interval_hours').notNullable().defaultTo(24);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('vendors', (t) => {
    t.increments('id').primary();
    t.text('name').notNullable();
    t.text('email').notNullable().unique();
    t.text('email_from_name');
    t.text('email_from_address');
    t.text('erp_url');
    t.text('api_key_hash');
    t.datetime('api_key_revoked_at');
    t.text('api_key_history').defaultTo('[]');
    t.integer('is_active').notNullable().defaultTo(1);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('vendor_tokens', (t) => {
    t.increments('id').primary();
    t.integer('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
    t.text('token_hash').notNullable().unique();
    t.datetime('expires_at').notNullable();
    t.datetime('revoked_at');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Credenziali email cifrate AES-256-GCM (relazione 1:1 con vendor)
  await knex.schema.createTable('vendor_credentials', (t) => {
    t.increments('id').primary();
    t.integer('vendor_id').notNullable().unique().references('id').inTable('vendors').onDelete('CASCADE');
    t.text('email_provider').notNullable().defaultTo('none'); // 'msgraph' | 'smtp' | 'none'
    t.text('msgraph_tenant_id_enc');   // JSON {iv, tag, data}
    t.text('msgraph_client_id_enc');
    t.text('msgraph_client_secret_enc');
    t.text('smtp_host_enc');
    t.text('smtp_user_enc');
    t.text('smtp_pass_enc');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('vendor_event_config', (t) => {
    t.increments('id').primary();
    t.text('event_code').notNullable().unique(); // NEW_REGISTRATION | LICENSE_EXPIRING | LICENSE_EXPIRED | CLIENT_INACTIVE | ALARM_RETRY
    t.integer('enabled').notNullable().defaultTo(1);
    t.integer('check_interval_hours'); // NULL = usa default da vendor_general_setup
    t.text('settings_json');
    t.datetime('last_run_at');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('products', (t) => {
    t.increments('id').primary();
    t.integer('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
    t.text('name').notNullable();
    t.text('code').notNullable().unique();
    t.integer('trial_duration_days').notNullable().defaultTo(30);
    t.text('trial_modules').defaultTo('[]');
    t.integer('license_check_frequency_days').notNullable().defaultTo(1);
    t.text('invoice_trigger').notNullable().defaultTo('invoice_issued'); // 'invoice_issued' | 'payment_received'
    t.integer('is_active').notNullable().defaultTo(1);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('modules', (t) => {
    t.increments('id').primary();
    t.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.text('code').notNullable();
    t.text('name').notNullable();
    t.text('description');
    t.integer('is_active').notNullable().defaultTo(1);
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['product_id', 'code']);
  });

  await knex.schema.createTable('clients', (t) => {
    t.increments('id').primary();
    t.integer('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.text('email').notNullable();
    t.text('name');
    t.text('company');
    t.text('vat_number');
    t.text('country');
    t.text('machine_id').notNullable();
    t.text('registration_status').notNullable().defaultTo('pending_otp'); // 'pending_otp' | 'active' | 'suspended'
    t.integer('vendor_synced').notNullable().defaultTo(0);
    t.text('offline_token'); // AES-256-GCM
    t.datetime('last_seen_at');
    t.timestamps(true, true);
    t.unique(['product_id', 'machine_id']);
  });

  await knex.schema.createTable('client_billing', (t) => {
    t.increments('id').primary();
    t.integer('client_id').notNullable().unique().references('id').inTable('clients').onDelete('CASCADE');
    t.text('address');
    t.text('city');
    t.text('postal_code');
    t.text('country');
    t.text('iban');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('client_tokens', (t) => {
    t.increments('id').primary();
    t.integer('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.text('token_hash').notNullable().unique();
    t.datetime('expires_at').notNullable();
    t.datetime('revoked_at');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('otp_codes', (t) => {
    t.increments('id').primary();
    t.integer('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.text('type').notNullable().defaultTo('registration'); // 'registration' | 'email_change'
    t.text('code_hash').notNullable(); // SHA-256
    t.datetime('expires_at').notNullable();
    t.datetime('used_at');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('otp_attempts', (t) => {
    t.increments('id').primary();
    t.integer('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.datetime('attempted_at').notNullable();
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('licenses', (t) => {
    t.increments('id').primary();
    t.integer('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.integer('product_id').notNullable().references('id').inTable('products');
    t.text('license_key').notNullable().unique(); // HMAC-SHA256
    t.text('type').notNullable().defaultTo('trial'); // 'trial' | 'monthly' | 'annual'
    t.text('status').notNullable().defaultTo('active'); // 'active' | 'expired' | 'revoked' | 'suspended'
    t.date('start_date').notNullable();
    t.date('end_date');
    t.datetime('activated_at');
    t.datetime('revoked_at');
    t.text('idempotency_key').unique();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('license_modules', (t) => {
    t.increments('id').primary();
    t.integer('license_id').notNullable().references('id').inTable('licenses').onDelete('CASCADE');
    t.integer('module_id').notNullable().references('id').inTable('modules').onDelete('CASCADE');
    t.integer('enabled').notNullable().defaultTo(1);
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['license_id', 'module_id']);
  });

  await knex.schema.createTable('messages', (t) => {
    t.increments('id').primary();
    t.integer('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.integer('license_id').references('id').inTable('licenses').onDelete('SET NULL');
    t.text('content').notNullable();
    t.text('type').notNullable().defaultTo('info');
    t.datetime('read_at');
    t.datetime('expires_at');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('email_templates', (t) => {
    t.increments('id').primary();
    t.text('key').notNullable().unique(); // es. 'otp_registration' | 'license_expiring' | 'trial_welcome'
    t.text('subject').notNullable();
    t.text('body_html').notNullable();
    t.text('placeholders').defaultTo('[]');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('client_activity_logs', (t) => {
    t.increments('id').primary();
    t.integer('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    t.text('action').notNullable();
    t.text('metadata');
    t.text('ip_address');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('alarm_logs', (t) => {
    t.increments('id').primary();
    t.integer('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
    t.integer('client_id').references('id').inTable('clients').onDelete('SET NULL');
    t.integer('license_id').references('id').inTable('licenses').onDelete('SET NULL');
    t.text('event_type').notNullable();
    t.text('status').notNullable().defaultTo('pending'); // 'pending' | 'sent' | 'failed' | 'permanently_failed'
    t.text('payload_json');
    t.integer('retry_count').notNullable().defaultTo(0);
    t.datetime('last_retry_at');
    t.datetime('next_retry_at');
    t.integer('max_retries').notNullable().defaultTo(5);
    t.integer('permanently_failed').notNullable().defaultTo(0);
    t.datetime('sent_at');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('rate_limits', (t) => {
    t.increments('id').primary();
    t.text('key').notNullable();
    t.text('endpoint').notNullable();
    t.integer('request_count').notNullable().defaultTo(1);
    t.datetime('window_start').notNullable();
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['key', 'endpoint']);
  });

  await knex.schema.createTable('idempotency_keys', (t) => {
    t.increments('id').primary();
    t.text('key').notNullable().unique();
    t.text('endpoint').notNullable();
    t.text('response_json').notNullable();
    t.datetime('expires_at').notNullable();
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  const tables = [
    'idempotency_keys',
    'rate_limits',
    'alarm_logs',
    'client_activity_logs',
    'email_templates',
    'messages',
    'license_modules',
    'licenses',
    'otp_attempts',
    'otp_codes',
    'client_tokens',
    'client_billing',
    'clients',
    'modules',
    'products',
    'vendor_event_config',
    'vendor_credentials',
    'vendor_tokens',
    'vendors',
    'vendor_general_setup',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
};
