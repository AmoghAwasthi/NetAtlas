--
-- PostgreSQL database dump
--

\restrict EXHyXLRFtZ0aT0hT0xdNPoBXZuOsPds2G1IHCeNYvIfCkmZLRsGr4VQggErTfWd

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: complete_scan(integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.complete_scan(IN p_scan_id integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE scan SET completed_at=NOW(), status='COMPLETED' WHERE scan_id=p_scan_id;
END; $$;


--
-- Name: device_metric_count(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.device_metric_count(p_device_id integer) RETURNS bigint
    LANGUAGE sql
    AS $$ SELECT COUNT(*) FROM metric WHERE device_id=p_device_id $$;


--
-- Name: device_status_label(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.device_status_label(p_status character varying) RETURNS text
    LANGUAGE sql
    AS $$ SELECT CASE WHEN p_status='UP' THEN 'Available' WHEN p_status='DOWN' THEN 'Offline' ELSE 'Unknown' END $$;


--
-- Name: log_device_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_device_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    new_event_id INTEGER;
BEGIN
    -- Ignore updates where the status hasn't changed.
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Record a DOWN event.
    IF NEW.status = 'DOWN' THEN

        INSERT INTO network_event (
            network_id,
            device_id,
            event_type,
            severity,
            message,
            detected_at
        )
        VALUES (
            NEW.network_id,
            NEW.device_id,
            'DEVICE_OFFLINE',
            'WARNING',
            NEW.hostname || ' has gone offline.',
            CURRENT_TIMESTAMP
        )
        RETURNING event_id INTO new_event_id;

        -- Create an alert associated with the event.
        INSERT INTO alert (
            device_id,
            event_id,
            alert_type,
            severity,
            status,
            created_at
        )
        VALUES (
            NEW.device_id,
            new_event_id,
            'DEVICE_OFFLINE',
            'WARNING',
            'ACTIVE',
            CURRENT_TIMESTAMP
        );

    -- Record an UP/recovery event.
    ELSIF NEW.status = 'UP' THEN

        INSERT INTO network_event (
            network_id,
            device_id,
            event_type,
            severity,
            message,
            detected_at
        )
        VALUES (
            NEW.network_id,
            NEW.device_id,
            'DEVICE_ONLINE',
            'INFO',
            NEW.hostname || ' has returned online.',
            CURRENT_TIMESTAMP
        );

        -- Resolve active offline alerts for this device.
        UPDATE alert
        SET
            status = 'RESOLVED',
            resolved_at = CURRENT_TIMESTAMP
        WHERE device_id = NEW.device_id
          AND alert_type = 'DEVICE_OFFLINE'
          AND status = 'ACTIVE';

        -- Mark the corresponding offline event as resolved.
        UPDATE network_event
        SET resolved_at = CURRENT_TIMESTAMP
        WHERE device_id = NEW.device_id
          AND event_type = 'DEVICE_OFFLINE'
          AND resolved_at IS NULL;

    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: set_device_status(integer, character varying); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.set_device_status(IN p_device_id integer, IN p_status character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE device SET status=p_status, last_seen=NOW() WHERE device_id=p_device_id;
END; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alert; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert (
    alert_id integer NOT NULL,
    device_id integer,
    event_id integer,
    alert_type character varying(50) NOT NULL,
    severity character varying(15) NOT NULL,
    status character varying(20) NOT NULL,
    created_at timestamp without time zone NOT NULL,
    resolved_at timestamp without time zone,
    CONSTRAINT chk_alert_severity CHECK (((severity)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'CRITICAL'::character varying])::text[])))
);


--
-- Name: alert_alert_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_alert_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_alert_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_alert_id_seq OWNED BY public.alert.alert_id;


--
-- Name: device; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device (
    device_id integer NOT NULL,
    network_id integer NOT NULL,
    hostname character varying(100) NOT NULL,
    device_type character varying(40) NOT NULL,
    vendor character varying(80),
    mac_address macaddr,
    management_ip inet,
    status character varying(15) NOT NULL,
    first_seen timestamp without time zone,
    last_seen timestamp without time zone,
    CONSTRAINT device_status_check CHECK (((status)::text = ANY ((ARRAY['UP'::character varying, 'DOWN'::character varying, 'UNKNOWN'::character varying])::text[])))
);


--
-- Name: device_device_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.device_device_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: device_device_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.device_device_id_seq OWNED BY public.device.device_id;


--
-- Name: device_service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_service (
    device_service_id integer NOT NULL,
    device_id integer NOT NULL,
    service_id integer NOT NULL,
    port integer,
    state character varying(15),
    last_seen timestamp without time zone
);


--
-- Name: device_service_device_service_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.device_service_device_service_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: device_service_device_service_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.device_service_device_service_id_seq OWNED BY public.device_service.device_service_id;


--
-- Name: interface; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interface (
    interface_id integer NOT NULL,
    device_id integer NOT NULL,
    interface_name character varying(60) NOT NULL,
    mac_address macaddr,
    speed_mbps integer,
    status character varying(15),
    description text,
    CONSTRAINT interface_status_check CHECK (((status)::text = ANY ((ARRAY['UP'::character varying, 'DOWN'::character varying])::text[])))
);


--
-- Name: interface_interface_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.interface_interface_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: interface_interface_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.interface_interface_id_seq OWNED BY public.interface.interface_id;


--
-- Name: ip_address; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_address (
    ip_id integer NOT NULL,
    interface_id integer NOT NULL,
    address inet NOT NULL,
    address_type character varying(20),
    is_primary boolean DEFAULT false,
    CONSTRAINT ip_address_address_type_check CHECK (((address_type)::text = ANY ((ARRAY['IPv4'::character varying, 'IPv6'::character varying])::text[])))
);


--
-- Name: ip_address_ip_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ip_address_ip_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ip_address_ip_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ip_address_ip_id_seq OWNED BY public.ip_address.ip_id;


--
-- Name: metric; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metric (
    metric_id integer NOT NULL,
    device_id integer NOT NULL,
    interface_id integer,
    metric_name character varying(50) NOT NULL,
    metric_value numeric(12,3) NOT NULL,
    unit character varying(20) NOT NULL,
    recorded_at timestamp without time zone NOT NULL
);


--
-- Name: metric_metric_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.metric_metric_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: metric_metric_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.metric_metric_id_seq OWNED BY public.metric.metric_id;


--
-- Name: network; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.network (
    network_id integer NOT NULL,
    site_id integer NOT NULL,
    network_name character varying(100) NOT NULL,
    cidr cidr NOT NULL,
    gateway inet,
    mode character varying(12) NOT NULL,
    CONSTRAINT network_mode_check CHECK (((mode)::text = ANY ((ARRAY['LIVE'::character varying, 'SIMULATION'::character varying])::text[])))
);


--
-- Name: network_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.network_event (
    event_id integer NOT NULL,
    network_id integer NOT NULL,
    device_id integer,
    event_type character varying(50) NOT NULL,
    severity character varying(15) NOT NULL,
    message text,
    detected_at timestamp without time zone NOT NULL,
    resolved_at timestamp without time zone,
    CONSTRAINT chk_event_severity CHECK (((severity)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'CRITICAL'::character varying])::text[])))
);


--
-- Name: network_event_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.network_event_event_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: network_event_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.network_event_event_id_seq OWNED BY public.network_event.event_id;


--
-- Name: network_network_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.network_network_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: network_network_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.network_network_id_seq OWNED BY public.network.network_id;


--
-- Name: scan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scan (
    scan_id integer NOT NULL,
    network_id integer NOT NULL,
    scan_type character varying(30) NOT NULL,
    mode character varying(12) NOT NULL,
    started_at timestamp without time zone NOT NULL,
    completed_at timestamp without time zone,
    status character varying(20),
    CONSTRAINT scan_mode_check CHECK (((mode)::text = ANY ((ARRAY['LIVE'::character varying, 'SIMULATION'::character varying])::text[])))
);


--
-- Name: scan_scan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scan_scan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scan_scan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scan_scan_id_seq OWNED BY public.scan.scan_id;


--
-- Name: service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service (
    service_id integer NOT NULL,
    service_name character varying(80) NOT NULL,
    protocol character varying(15) NOT NULL,
    default_port integer,
    description text
);


--
-- Name: service_service_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_service_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_service_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_service_id_seq OWNED BY public.service.service_id;


--
-- Name: site; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site (
    site_id integer NOT NULL,
    site_name character varying(100) NOT NULL,
    location character varying(150),
    description text
);


--
-- Name: site_site_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.site_site_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: site_site_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.site_site_id_seq OWNED BY public.site.site_id;


--
-- Name: topology_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topology_link (
    link_id integer NOT NULL,
    source_interface_id integer NOT NULL,
    destination_interface_id integer NOT NULL,
    link_type character varying(30),
    status character varying(15),
    last_checked timestamp without time zone,
    CONSTRAINT chk_no_self_link CHECK ((source_interface_id <> destination_interface_id)),
    CONSTRAINT topology_link_status_check CHECK (((status)::text = ANY ((ARRAY['UP'::character varying, 'DOWN'::character varying])::text[])))
);


--
-- Name: topology_link_link_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.topology_link_link_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: topology_link_link_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.topology_link_link_id_seq OWNED BY public.topology_link.link_id;


--
-- Name: v_active_devices; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_active_devices AS
 SELECT device_id,
    hostname,
    management_ip,
    status
   FROM public.device
  WHERE ((status)::text = 'UP'::text);


--
-- Name: v_device_metric_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_device_metric_summary AS
 SELECT d.device_id,
    d.hostname,
    count(m.metric_id) AS metric_count,
    avg(m.metric_value) AS avg_metric
   FROM (public.device d
     LEFT JOIN public.metric m ON ((d.device_id = m.device_id)))
  GROUP BY d.device_id, d.hostname;


--
-- Name: v_topology; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_topology AS
 SELECT d1.hostname AS source_device,
    d2.hostname AS destination_device,
    tl.status
   FROM ((((public.topology_link tl
     JOIN public.interface i1 ON ((tl.source_interface_id = i1.interface_id)))
     JOIN public.interface i2 ON ((tl.destination_interface_id = i2.interface_id)))
     JOIN public.device d1 ON ((i1.device_id = d1.device_id)))
     JOIN public.device d2 ON ((i2.device_id = d2.device_id)));


--
-- Name: alert alert_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert ALTER COLUMN alert_id SET DEFAULT nextval('public.alert_alert_id_seq'::regclass);


--
-- Name: device device_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device ALTER COLUMN device_id SET DEFAULT nextval('public.device_device_id_seq'::regclass);


--
-- Name: device_service device_service_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_service ALTER COLUMN device_service_id SET DEFAULT nextval('public.device_service_device_service_id_seq'::regclass);


--
-- Name: interface interface_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interface ALTER COLUMN interface_id SET DEFAULT nextval('public.interface_interface_id_seq'::regclass);


--
-- Name: ip_address ip_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_address ALTER COLUMN ip_id SET DEFAULT nextval('public.ip_address_ip_id_seq'::regclass);


--
-- Name: metric metric_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric ALTER COLUMN metric_id SET DEFAULT nextval('public.metric_metric_id_seq'::regclass);


--
-- Name: network network_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network ALTER COLUMN network_id SET DEFAULT nextval('public.network_network_id_seq'::regclass);


--
-- Name: network_event event_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network_event ALTER COLUMN event_id SET DEFAULT nextval('public.network_event_event_id_seq'::regclass);


--
-- Name: scan scan_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan ALTER COLUMN scan_id SET DEFAULT nextval('public.scan_scan_id_seq'::regclass);


--
-- Name: service service_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service ALTER COLUMN service_id SET DEFAULT nextval('public.service_service_id_seq'::regclass);


--
-- Name: site site_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site ALTER COLUMN site_id SET DEFAULT nextval('public.site_site_id_seq'::regclass);


--
-- Name: topology_link link_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topology_link ALTER COLUMN link_id SET DEFAULT nextval('public.topology_link_link_id_seq'::regclass);


--
-- Name: alert alert_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert
    ADD CONSTRAINT alert_pkey PRIMARY KEY (alert_id);


--
-- Name: device device_mac_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device
    ADD CONSTRAINT device_mac_address_key UNIQUE (mac_address);


--
-- Name: device device_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device
    ADD CONSTRAINT device_pkey PRIMARY KEY (device_id);


--
-- Name: device_service device_service_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_service
    ADD CONSTRAINT device_service_pkey PRIMARY KEY (device_service_id);


--
-- Name: interface interface_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interface
    ADD CONSTRAINT interface_pkey PRIMARY KEY (interface_id);


--
-- Name: ip_address ip_address_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_address
    ADD CONSTRAINT ip_address_address_key UNIQUE (address);


--
-- Name: ip_address ip_address_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_address
    ADD CONSTRAINT ip_address_pkey PRIMARY KEY (ip_id);


--
-- Name: metric metric_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric
    ADD CONSTRAINT metric_pkey PRIMARY KEY (metric_id);


--
-- Name: network_event network_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network_event
    ADD CONSTRAINT network_event_pkey PRIMARY KEY (event_id);


--
-- Name: network network_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network
    ADD CONSTRAINT network_pkey PRIMARY KEY (network_id);


--
-- Name: scan scan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan
    ADD CONSTRAINT scan_pkey PRIMARY KEY (scan_id);


--
-- Name: service service_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service
    ADD CONSTRAINT service_pkey PRIMARY KEY (service_id);


--
-- Name: service service_service_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service
    ADD CONSTRAINT service_service_name_key UNIQUE (service_name);


--
-- Name: site site_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site
    ADD CONSTRAINT site_pkey PRIMARY KEY (site_id);


--
-- Name: site site_site_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site
    ADD CONSTRAINT site_site_name_key UNIQUE (site_name);


--
-- Name: topology_link topology_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topology_link
    ADD CONSTRAINT topology_link_pkey PRIMARY KEY (link_id);


--
-- Name: interface uq_device_interface; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interface
    ADD CONSTRAINT uq_device_interface UNIQUE (device_id, interface_name);


--
-- Name: device_service uq_device_service_port; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_service
    ADD CONSTRAINT uq_device_service_port UNIQUE (device_id, service_id, port);


--
-- Name: network uq_network_site_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network
    ADD CONSTRAINT uq_network_site_name UNIQUE (site_id, network_name);


--
-- Name: idx_metric_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metric_device_id ON public.metric USING btree (device_id);


--
-- Name: device trg_device_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_device_status_change AFTER UPDATE OF status ON public.device FOR EACH ROW EXECUTE FUNCTION public.log_device_status_change();


--
-- Name: alert fk_alert_device; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert
    ADD CONSTRAINT fk_alert_device FOREIGN KEY (device_id) REFERENCES public.device(device_id) ON DELETE SET NULL;


--
-- Name: alert fk_alert_event; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert
    ADD CONSTRAINT fk_alert_event FOREIGN KEY (event_id) REFERENCES public.network_event(event_id) ON DELETE SET NULL;


--
-- Name: topology_link fk_destination_interface; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topology_link
    ADD CONSTRAINT fk_destination_interface FOREIGN KEY (destination_interface_id) REFERENCES public.interface(interface_id) ON DELETE CASCADE;


--
-- Name: device fk_device_network; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device
    ADD CONSTRAINT fk_device_network FOREIGN KEY (network_id) REFERENCES public.network(network_id) ON DELETE CASCADE;


--
-- Name: device_service fk_device_service_device; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_service
    ADD CONSTRAINT fk_device_service_device FOREIGN KEY (device_id) REFERENCES public.device(device_id) ON DELETE CASCADE;


--
-- Name: device_service fk_device_service_service; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_service
    ADD CONSTRAINT fk_device_service_service FOREIGN KEY (service_id) REFERENCES public.service(service_id) ON DELETE CASCADE;


--
-- Name: network_event fk_event_device; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network_event
    ADD CONSTRAINT fk_event_device FOREIGN KEY (device_id) REFERENCES public.device(device_id) ON DELETE SET NULL;


--
-- Name: network_event fk_event_network; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network_event
    ADD CONSTRAINT fk_event_network FOREIGN KEY (network_id) REFERENCES public.network(network_id) ON DELETE CASCADE;


--
-- Name: interface fk_interface_device; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interface
    ADD CONSTRAINT fk_interface_device FOREIGN KEY (device_id) REFERENCES public.device(device_id) ON DELETE CASCADE;


--
-- Name: ip_address fk_ip_interface; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_address
    ADD CONSTRAINT fk_ip_interface FOREIGN KEY (interface_id) REFERENCES public.interface(interface_id) ON DELETE CASCADE;


--
-- Name: metric fk_metric_device; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric
    ADD CONSTRAINT fk_metric_device FOREIGN KEY (device_id) REFERENCES public.device(device_id) ON DELETE CASCADE;


--
-- Name: metric fk_metric_interface; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric
    ADD CONSTRAINT fk_metric_interface FOREIGN KEY (interface_id) REFERENCES public.interface(interface_id) ON DELETE SET NULL;


--
-- Name: network fk_network_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network
    ADD CONSTRAINT fk_network_site FOREIGN KEY (site_id) REFERENCES public.site(site_id);


--
-- Name: scan fk_scan_network; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scan
    ADD CONSTRAINT fk_scan_network FOREIGN KEY (network_id) REFERENCES public.network(network_id) ON DELETE CASCADE;


--
-- Name: topology_link fk_source_interface; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topology_link
    ADD CONSTRAINT fk_source_interface FOREIGN KEY (source_interface_id) REFERENCES public.interface(interface_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict EXHyXLRFtZ0aT0hT0xdNPoBXZuOsPds2G1IHCeNYvIfCkmZLRsGr4VQggErTfWd

