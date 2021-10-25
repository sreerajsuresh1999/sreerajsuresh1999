# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
import logging

_logger = logging.getLogger(__name__)


class pos_session(models.Model):
    _inherit = 'pos.session'

    def init(self):
        self.env.cr.execute("""
        CREATE OR REPLACE FUNCTION public.fast_closing_session(session_id integer, cashier_id integer, currency_id integer )
            RETURNS void AS
            $BODY$
            DECLARE
                abs RECORD;
                abs_line RECORD;
                am_id integer;
                payment_id integer;
                pref varchar(10);
                seq integer;
                count integer := 0;
                temp integer := 0;
                credit_id integer;
                debit_id integer;
                comp_id integer;
            BEGIN
                FOR abs IN SELECT * FROM "account_bank_statement" WHERE ("pos_session_id" in (session_id)) ORDER BY "date" DESC,"id" DESC 
              LOOP
                select LEFT(prefix,5) from ir_sequence where id = (select sequence_id from account_journal where id=abs.journal_id) into pref;
                select number_next from ir_sequence_date_range where sequence_id = (select sequence_id from account_journal where id=abs.journal_id) order by id asc into seq;
                FOR abs_line IN SELECT * from "account_bank_statement_line" WHERE statement_id = abs.id 
                LOOP
                  RAISE NOTICE '%s', abs_line.name;
                  temp := seq + count;
                  select company_id from res_partner where id=abs_line.partner_id into comp_id;
                  INSERT INTO "account_move" ("id", "name", "partner_id", "amount_total", "company_id", "journal_id", "state", "date", "ref", "type", "currency_id", "extract_state", "create_uid", "write_uid", "create_date", "write_date") VALUES (
                    nextval('account_move_id_seq'), 
                    abs_line.ref || abs.name,
                    abs_line.partner_id,
                    abs(abs_line.amount),
                    comp_id,
                    abs.journal_id, 
                    'posted',
                    (now() at time zone 'UTC'), 
                    abs.name,
                    'out_invoice',
                    currency_id,
                    'no_extract_requested',
                    cashier_id,
                    cashier_id,
                    (now() at time zone 'UTC'), 
                    (now() at time zone 'UTC')) RETURNING id into am_id;
            
                    count = count + 1;
            
                  INSERT INTO "account_payment" ("id", "payment_date", "name", "communication", "payment_difference_handling", "journal_id", "move_name", "currency_id", "partner_type",   "state", "payment_type", "amount", "partner_id", "payment_method_id", "create_uid", "write_uid", "create_date", "write_date") VALUES(
                  nextval('account_payment_id_seq'), 
                  (now() at time zone 'UTC'), 
                  abs.name, 
                  abs_line.name, 
                  'open', 
                  abs.journal_id, 
                  NULL, 
                  13, 
                  'customer', 
                  'reconciled', 
                  'inbound', 
                  abs(abs_line.amount),
                  abs_line.partner_id,
                  cashier_id,
                  cashier_id,
                  cashier_id,
                  (now() at time zone 'UTC'), 
                  (now() at time zone 'UTC')) RETURNING id into payment_id;
            
                  select default_debit_account_id from account_journal where id=abs.journal_id into debit_id; 
                  select substring(value_reference, ',(.*)$') from ir_property where company_id = comp_id and name='property_account_receivable_id' into credit_id;
                  IF credit_id is null THEN
                    select substring(value_reference, ',(.*)$') from ir_property where  name='property_account_receivable_id' into credit_id;
                  END IF;
            
                  IF abs_line.amount < 0 THEN
                    debit_id := debit_id + credit_id;
                    credit_id := debit_id - credit_id;
                    debit_id := debit_id - credit_id;
                  END IF;
                  
                  INSERT INTO "account_move_line" ("id", "date", "journal_id", "payment_id", "name", "tax_exigible", "reconciled", "statement_id", "currency_id", "credit", "date_maturity", "debit", "amount_currency", "blocked", "partner_id", "move_id", "account_id", "create_uid", "write_uid", "create_date", "write_date") VALUES(
                    nextval('account_move_line_id_seq'),
                    (now() at time zone 'UTC'),  
                    abs.journal_id,
                    payment_id, 
                    abs_line.name, 
                    true, 
                    false, 
                    abs.id, 
                    NULL, 
                    abs(abs_line.amount), 
                    (now() at time zone 'UTC'),
                    0.0, 
                    0.0, 
                    false, 
                    abs_line.partner_id,
                    am_id, 
                    credit_id,
                    cashier_id,
                    cashier_id,
                    (now() at time zone 'UTC'), (now() at time zone 'UTC'));
            
                  INSERT INTO "account_move_line" ("id", "date", "journal_id", "payment_id", "statement_id", "tax_exigible", "reconciled", "account_id", "currency_id", "credit", "date_maturity", "debit", "amount_currency", "blocked", "partner_id", "move_id", "name", "create_uid", "write_uid", "create_date", "write_date") VALUES(
                    nextval('account_move_line_id_seq'),
                    (now() at time zone 'UTC'),  
                    abs.journal_id,
                    payment_id, 
                    abs.id, 
                    true, 
                    false, 
                    debit_id,
                    NULL, 
                    0.0, 
                    (now() at time zone 'UTC'),
                    abs(abs_line.amount), 
                    0.0, 
                    false, 
                    abs_line.partner_id ,
                    am_id, 
                    abs_line.name, 
                    cashier_id,
                    cashier_id,
                    (now() at time zone 'UTC'), (now() at time zone 'UTC'));
                END LOOP; -- abs_line
                update account_bank_statement set state='confirm', balance_end_real=balance_end, difference=0.0,total_entry_encoding=balance_end where id=abs.id;
            
              END LOOP; -- abs
              update ir_sequence_date_range set number_next = number_next + count where sequence_id=(select sequence_id from account_journal where id=abs.journal_id) and number_next=seq;
              UPDATE "pos_session" SET "state"='closed',  "stop_at"=(now() at time zone 'UTC'), "write_uid"=1,"write_date"=(now() at time zone 'UTC') WHERE id IN (session_id);
            END;
            $BODY$
              LANGUAGE plpgsql VOLATILE
              COST 100;
        """)

    def fast_closing(self):
        self.env.cr.execute("select fast_closing_session(%s, %s, %s)" % (self.id, self.env.user.id, self.env.user.company_id.currency_id.id))
