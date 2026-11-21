-- Qiyas schema. The API applies this on first use (each statement is idempotent).

CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  green_days integer NOT NULL DEFAULT 90,
  orange_days integer NOT NULL DEFAULT 180,
  delivery_fee numeric(12,3) NOT NULL DEFAULT 1.250,
  notifications_enabled boolean NOT NULL DEFAULT true,
  next_order_code integer NOT NULL DEFAULT 6768,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shops_age_ranges CHECK (green_days > 0 AND orange_days > green_days),
  CONSTRAINT shops_delivery_fee_nonneg CHECK (delivery_fee >= 0)
);

CREATE TABLE IF NOT EXISTS measurement_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  label_ar text,
  is_custom boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, key)
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  phone_digits text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, phone_digits)
);

CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (shop_id, phone_digits);

CREATE TABLE IF NOT EXISTS measurement_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  taken_at timestamptz NOT NULL DEFAULT now(),
  unit text NOT NULL CHECK (unit IN ('cm', 'in')),
  method text NOT NULL CHECK (method IN ('body', 'flat', 'finished')),
  ease_included boolean NOT NULL DEFAULT false,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS measurement_sets_customer_idx ON measurement_sets (customer_id, taken_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  measurement_set_id uuid REFERENCES measurement_sets(id),
  code text NOT NULL,
  piece_count integer NOT NULL CHECK (piece_count > 0 AND piece_count <= 30),
  piece_label text,
  original_due_date date NOT NULL,
  expected_due_date date NOT NULL,
  total_amount numeric(12,3) NOT NULL CHECK (total_amount >= 0),
  amount_paid numeric(12,3) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  delivery_fee_applied boolean NOT NULL DEFAULT false,
  fabric_notes text NOT NULL DEFAULT '',
  style_notes text NOT NULL DEFAULT '',
  production_status text NOT NULL DEFAULT 'in_progress' CHECK (production_status IN ('in_progress', 'finished')),
  finished_at timestamptz,
  handover_status text NOT NULL DEFAULT 'awaiting_collection' CHECK (
    handover_status IN ('awaiting_collection', 'delivery_requested', 'with_driver', 'delivered')
  ),
  tracking_token text NOT NULL UNIQUE,
  notifications_muted boolean NOT NULL DEFAULT false,
  is_adjustment boolean NOT NULL DEFAULT false,
  parent_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  adjustment_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, code)
);

CREATE INDEX IF NOT EXISTS orders_shop_due_idx ON orders (shop_id, production_status, expected_due_date);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_tracking_idx ON orders (tracking_token);
CREATE INDEX IF NOT EXISTS orders_piece_label_idx ON orders (shop_id, piece_label) WHERE piece_label IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount numeric(12,3) NOT NULL CHECK (amount > 0),
  source text NOT NULL CHECK (source IN ('in_shop', 'link')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel text NOT NULL,
  template text NOT NULL,
  body text NOT NULL,
  status text NOT NULL,
  provider text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_order_idx ON messages (order_id, created_at);
