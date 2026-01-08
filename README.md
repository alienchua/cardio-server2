# BENTO MVC Backend Boilerplate

PostgreSQL, NodeJS, Express, JWT Auth with Cookies Session Refresh Token

```
.
├── .env
├── .gitignore
├── drawDirectory.js
├── generateFeature.js
├── package-lock.json
├── package.json
├── postgresQuery.sql
├── server.js
└── v1
    ├── config
    │   └── swaggerConfig.js
    ├── controllers
    │   └── authController.js
    ├── middlewares
    │   ├── auth.js
    │   ├── authwithredis.js
    │   ├── bruteForceProtection.js
    │   ├── errorFormatter.js
    │   ├── errorHandler.js
    │   ├── rateLimiter.js
    │   ├── responseFormatter.js
    │   ├── roleMiddleware.js
    │   └── sanitize.js
    ├── models
    │   └── userModel.js
    ├── routes
    │   ├── authRoutes.js
    │   └── authRoutes.swagger.js
    └── views
        └── index.ejs
```


## Installation

Use the package manager [npm](https://nodejs.org/en) to install structure after git clone.

```bash
npm i 
```

## Usage
Change the .env to to fit your own posgreSQL setting

Create Tables in your database

```sql


CREATE TABLE admins (
    id BIGSERIAL PRIMARY KEY NOT NULL,
    username VARCHAR(100),ad
    email VARCHAR(100),
    phone VARCHAR(15),
    password VARCHAR(255),
    role VARCHAR(50) , 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);


CREATE TABLE access_tokens (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE TABLE token_blacklist (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    blacklisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accessories
(
    model_code character varying(20) COLLATE pg_catalog."default" NOT NULL,
    model character varying(20) COLLATE pg_catalog."default" NOT NULL,
    model_description character varying(50) COLLATE pg_catalog."default" NOT NULL,
    accessory_type character varying(10) COLLATE pg_catalog."default" NOT NULL,
    accessory_code character varying(10) COLLATE pg_catalog."default" NOT NULL,
    price bigint NOT NULL,
    duration bigint NOT NULL,
    type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    no integer NOT NULL DEFAULT nextval('accessories_no_seq'::regclass),
    full_name text COLLATE pg_catalog."default",
    short_name character varying(255) COLLATE pg_catalog."default",
    CONSTRAINT "PK_0857fbf58e32859340a4355a07e" PRIMARY KEY (no)
)


CREATE TABLE bay
(
    no integer NOT NULL DEFAULT nextval('bay_no_seq'::regclass),
    name character varying(50) COLLATE pg_catalog."default" NOT NULL,
    type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT "PK_ac65a7cefd01fb61d2e424eb8f8" PRIMARY KEY (no)
)


CREATE TABLE baycurrent
(
    no integer NOT NULL DEFAULT nextval('baycurrent_no_seq'::regclass),
    staff_id integer,
    bay_id integer,
    CONSTRAINT "PK_75e739533d112bcb6a7addc0e15" PRIMARY KEY (no),
    CONSTRAINT "FK_0922f1e6e5c047362ef159f1370" FOREIGN KEY (staff_id)
        REFERENCES public.staff (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT "FK_2064a6d4b73bd13c27dbf68a9b8" FOREIGN KEY (bay_id)
        REFERENCES public.bay (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

CREATE TABLE checkin
(
    no bigint NOT NULL DEFAULT nextval('checkin_no_seq'::regclass),
    masterlist_id bigint,
    action_by bigint,
    bay_id bigint,
    status character varying(50) COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    checkout_time timestamp without time zone,
    remark text COLLATE pg_catalog."default",
    type character varying(20) COLLATE pg_catalog."default",
    checkin_time timestamp without time zone,
    accessories timestamp without time zone,
    accessory_status character varying(50) COLLATE pg_catalog."default",
    accessory_pickup timestamp without time zone,
    showaccessories character varying(50) COLLATE pg_catalog."default",
    CONSTRAINT checkin_pkey PRIMARY KEY (no),
    CONSTRAINT checkin_action_by_fkey FOREIGN KEY (action_by)
        REFERENCES public.admins (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT checkin_bay_id_fkey FOREIGN KEY (bay_id)
        REFERENCES public.bay (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT checkin_masterlist_id_fkey FOREIGN KEY (masterlist_id)
        REFERENCES public.masterlist (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

CREATE TABLE checkin_staff
(
    no bigint NOT NULL DEFAULT nextval('checkin_staff_no_seq'::regclass),
    checkin_id bigint,
    staff_id bigint,
    "position" character varying(50) COLLATE pg_catalog."default",
    CONSTRAINT checkin_staff_pkey PRIMARY KEY (no),
    CONSTRAINT checkin_staff_checkin_id_fkey FOREIGN KEY (checkin_id)
        REFERENCES public.checkin (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT checkin_staff_staff_id_fkey FOREIGN KEY (staff_id)
        REFERENCES public.staff (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

CREATE TABLE installment
(
    no bigint NOT NULL DEFAULT nextval('installment_no_seq'::regclass),
    staff_id integer,
    amount bigint,
    installment integer,
    remark text COLLATE pg_catalog."default",
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT installment_pkey PRIMARY KEY (no)
)

CREATE TABLE masterlist
(
    no bigint NOT NULL DEFAULT nextval('masterlist_no_seq'::regclass),
    chassis character varying(50) COLLATE pg_catalog."default",
    seq integer,
    fitment_id character varying(50) COLLATE pg_catalog."default",
    model_code character varying(50) COLLATE pg_catalog."default",
    model_description character varying(50) COLLATE pg_catalog."default",
    colour character varying(10) COLLATE pg_catalog."default",
    accessories_std character varying(255) COLLATE pg_catalog."default",
    accessories_otp character varying(50) COLLATE pg_catalog."default",
    accessories_full character varying(255) COLLATE pg_catalog."default",
    caout_date timestamp without time zone,
    caout_time timestamp without time zone,
    cafi_date timestamp without time zone,
    status character varying(20) COLLATE pg_catalog."default" DEFAULT 'Active'::character varying,
    cancel_remark character varying(255) COLLATE pg_catalog."default",
    cancel_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT masterlist_pkey PRIMARY KEY (no),
    CONSTRAINT unique_chassis_fitment UNIQUE (chassis, fitment_id)
)

CREATE TABLE specialacc
(
    no bigint NOT NULL DEFAULT nextval('specialacc_no_seq'::regclass),
    model_code character varying(20) COLLATE pg_catalog."default",
    model character varying(20) COLLATE pg_catalog."default",
    model_description character varying(20) COLLATE pg_catalog."default",
    accessory_code character varying(20) COLLATE pg_catalog."default",
    accessory_type character varying(20) COLLATE pg_catalog."default",
    color_code character varying(20) COLLATE pg_catalog."default",
    CONSTRAINT specialacc_pkey PRIMARY KEY (no)
)

CREATE TABLE staff
(
    no integer NOT NULL DEFAULT nextval('staff_no_seq'::regclass),
    staff_id character varying(50) COLLATE pg_catalog."default" NOT NULL,
    name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    ic character varying(20) COLLATE pg_catalog."default" NOT NULL,
    bank_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    acc_number character varying(50) COLLATE pg_catalog."default" NOT NULL,
    nick_name character varying(255) COLLATE pg_catalog."default" NOT NULL,
    type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    photo text COLLATE pg_catalog."default" NOT NULL,
    email text COLLATE pg_catalog."default",
    gender character varying(20) COLLATE pg_catalog."default",
    kwsp_id text COLLATE pg_catalog."default",
    contact character varying(20) COLLATE pg_catalog."default",
    CONSTRAINT "PK_fcc33f76dabf4b8575315c65105" PRIMARY KEY (no)
)

CREATE TABLE task_item
(
    no bigint NOT NULL DEFAULT nextval('task_item_no_seq'::regclass),
    masterlist_id bigint,
    accessories_id bigint,
    price bigint,
    duration integer,
    type character varying(50) COLLATE pg_catalog."default",
    short_name character varying(255) COLLATE pg_catalog."default",
    CONSTRAINT task_item_pkey PRIMARY KEY (no),
    CONSTRAINT task_item_accessories_id_fkey FOREIGN KEY (accessories_id)
        REFERENCES public.accessories (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT task_item_masterlist_id_fkey FOREIGN KEY (masterlist_id)
        REFERENCES public.masterlist (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

CREATE TABLE task_offset
(
    no bigint NOT NULL DEFAULT nextval('task_offset_no_seq'::regclass),
    masterlist_id bigint,
    action_by bigint,
    amount bigint,
    remark character varying(255) COLLATE pg_catalog."default",
    staff_id bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    parts_id jsonb,
    amount2 bigint,
    CONSTRAINT task_offset_pkey PRIMARY KEY (no),
    CONSTRAINT task_offset_action_by_fkey FOREIGN KEY (action_by)
        REFERENCES public.admins (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT task_offset_masterlist_id_fkey FOREIGN KEY (masterlist_id)
        REFERENCES public.masterlist (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT task_offset_staff_id_fkey FOREIGN KEY (staff_id)
        REFERENCES public.staff (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

CREATE TABLE settlement_month
(
    id bigint NOT NULL DEFAULT nextval('settlement_month_id_seq'::regclass),
    month date NOT NULL,
    is_settled boolean NOT NULL DEFAULT false,
    settled_at timestamp without time zone,
    notes text COLLATE pg_catalog."default",
    CONSTRAINT settlement_month_pkey PRIMARY KEY (id),
    CONSTRAINT settlement_month_month_key UNIQUE (month)
)

 CREATE TABLE staff_attendance (
    no          BIGSERIAL PRIMARY KEY,
    staff_id    INTEGER NOT NULL,
    month_label VARCHAR(20) NOT NULL,      -- e.g., '2025-12'
    attendance  INTEGER DEFAULT 0,
    CONSTRAINT fk_staff_attendance_staff
    FOREIGN KEY (staff_id) REFERENCES staff(no),
    CONSTRAINT uq_staff_month UNIQUE (staff_id, month_label)
  );


  CREATE TABLE IF NOT EXISTS baylog
(
    no integer NOT NULL DEFAULT nextval('baylog_no_seq'::regclass),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    remark character varying(20) COLLATE pg_catalog."default" NOT NULL,
    staff_id integer,
    action_by integer,
    bay_id integer,
    CONSTRAINT "PK_f650d4e4bbddca9de01dd639c12" PRIMARY KEY (no),
    CONSTRAINT "FK_64ad8d6925b111f000c749d6b75" FOREIGN KEY (staff_id)
        REFERENCES public.staff (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT "FK_6ee6af7980c2b201ca1ea3f784e" FOREIGN KEY (action_by)
        REFERENCES public.admins (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
    CONSTRAINT "FK_ae486bb73f17e9ad1756cda34c4" FOREIGN KEY (bay_id)
        REFERENCES public.bay (no) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

```

## Summary of Steps: 
### generateFeature.js Scripts will auto generate the file with imported routes boilerplate into the correct directory and formated naming base on MVC standards 

```
node generateFeature.js newFeature
```

   1. Define the Feature Requirements: Document expected inputs, outputs, and behavior.

   2. Create the Model: Define the data structure and database interactions.

   3. Create the Controller: Handle business logic and interact with the model.

   4. Create the Route: Define the API endpoint and link it to the controller function

   5. Add in middlewares into the routes:
        e.g router.post('/feature',auth, errorFormatter, featureController.handleFeature);

   6. Create the Swagger Documentation: Document the API endpoint.

   7. Update server.js: Import and use the new route and Swagger documentation.

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
CodeBento 2024
