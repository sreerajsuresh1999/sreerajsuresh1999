# -*- coding: utf-8 -*-
from odoo import fields, models, api, SUPERUSER_ID, _
import odoo
from odoo.tools import DEFAULT_SERVER_DATE_FORMAT, DEFAULT_SERVER_DATETIME_FORMAT

version_info = odoo.release.version_info[0]

import pytz
from pytz import timezone
import logging

from datetime import datetime, date, timedelta

_logger = logging.getLogger(__name__)


class pos_session(models.Model):
    _inherit = "pos.session"

    def get_pos_name(self):
        if self and self.config_id:
            return self.config_id.name

    def get_report_timezone(self):
        if self.env.user and self.env.user.tz:
            tz = timezone(self.env.user.tz)
        else:
            tz = pytz.utc
        return tz

    def get_session_date(self, date_time):
        if date_time:
            if self.env.user and self.env.user.tz:
                tz = timezone(self.env.user.tz)
            else:
                tz = pytz.utc
            c_time = datetime.now(tz)
            hour_tz = int(str(c_time)[-5:][:2])
            min_tz = int(str(c_time)[-5:][3:])
            sign = str(c_time)[-6][:1]
            if sign == '+':
                date_time = date_time + \
                            timedelta(hours=hour_tz, minutes=min_tz)
            else:
                date_time = date_time - \
                            timedelta(hours=hour_tz, minutes=min_tz)
            return date_time.strftime('%d/%m/%Y %I:%M:%S %p')

    def get_session_time(self, date_time):
        if date_time:
            if self.env.user and self.env.user.tz:
                tz = timezone(self.env.user.tz)
            else:
                tz = pytz.utc
            c_time = datetime.now(tz)
            hour_tz = int(str(c_time)[-5:][:2])
            min_tz = int(str(c_time)[-5:][3:])
            sign = str(c_time)[-6][:1]
            if sign == '+':
                date_time = date_time + \
                            timedelta(hours=hour_tz, minutes=min_tz)
            else:
                date_time = date_time - \
                            timedelta(hours=hour_tz, minutes=min_tz)
            return date_time.strftime('%I:%M:%S %p')

    def get_current_date(self):
        if self.env.user and self.env.user.tz:
            tz = self.env.user.tz
            tz = timezone(tz)
        else:
            tz = pytz.utc
        if tz:
            c_time = datetime.now(tz)
            return c_time.strftime('%d/%m/%Y')
        else:
            return date.today().strftime('%d/%m/%Y')

    def get_current_time(self):
        if self.env.user and self.env.user.tz:
            tz = self.env.user.tz
            tz = timezone(tz)
        else:
            tz = pytz.utc
        if tz:
            c_time = datetime.now(tz)
            return c_time.strftime('%I:%M %p')
        else:
            return datetime.now().strftime('%I:%M:%S %p')

    def build_sessions_report(self):
        vals = {}
        session_state = {
            'new_session': _('New Session'),
            'opening_control': _('Opening Control'),
            'opened': _('In Progress'),
            'closing_control': _('Closing Control'),
            'closed': _('Closed & Posted'),
        }
        for session in self:
            session_report = {}
            session_report['session'] = self.sudo().search_read([('id', '=', session.id)], [])[0]
            session_report['name'] = session.name
            session_report['current_date'] = session.get_current_date()
            session_report['current_time'] = session.get_current_time()
            session_report['state'] = session_state[session.state]
            session_report['start_at'] = session.start_at
            session_report['stop_at'] = session.stop_at
            session_report['seller'] = session.user_id.name
            session_report['cash_register_balance_start'] = session.cash_register_balance_start
            session_report['sales_total'] = session.get_total_sales()
            session_report['reversal_total'] = session.get_total_reversal()
            session_report['reversal_orders_detail'] = session.get_reversal_orders_detail()
            session_report['taxes'] = session.get_vat_tax()
            session_report['taxes_total'] = session.get_vat_tax()
            session_report['discounts_total'] = session.get_total_discount()
            session_report['users_summary'] = session.get_sale_summary_by_user()
            session_report['refund_total'] = session.get_total_refund()
            session_report['gross_total'] = session.get_total_first()
            session_report['gross_profit_total'] = session.get_gross_total()
            session_report['net_gross_total'] = session.get_net_gross_total()
            session_report['cash_register_balance_end_real'] = session.cash_register_balance_end_real
            session_report['closing_total'] = session.get_total_closing()
            session_report['payments_amount'] = session.get_payments_amount()
            session_report['cashs_in'] = session.get_cash_in()
            session_report['cashs_out'] = session.get_cash_out()
            vals[session.id] = session_report
        return vals

    def get_cash_in(self):
        values = []
        account_bank_statement_lines = self.env['account.bank.statement.line'].search([
            ('pos_session_id', '=', self.id),
            ('pos_cash_type', '=', 'in')
        ])
        for line in account_bank_statement_lines:
            values.append({
                'amount': line.amount,
                'date': line.create_date
            })
        return values

    def get_cash_out(self):
        values = []
        account_bank_statement_lines = self.env['account.bank.statement.line'].search([
            ('pos_session_id', '=', self.id),
            ('pos_cash_type', '=', 'out')
        ])
        for line in account_bank_statement_lines:
            values.append({
                'amount': line.amount,
                'date': line.create_date
            })
        return values

    def get_inventory_details(self):
        product_product = self.env['product.product']
        stock_location = self.config_id.stock_location_id
        inventory_records = []
        final_list = []
        product_details = []
        if self and self.id:
            for order in self.order_ids:
                for line in order.lines:
                    product_details.append({
                        'id': line.product_id.id,
                        'qty': line.qty,
                    })
        custom_list = []
        for each_prod in product_details:
            if each_prod.get('id') not in [x.get('id') for x in custom_list]:
                custom_list.append(each_prod)
            else:
                for each in custom_list:
                    if each.get('id') == each_prod.get('id'):
                        each.update({'qty': each.get('qty') + each_prod.get('qty')})
        for each in custom_list:
            product_id = product_product.browse(each.get('id'))
            if product_id:
                inventory_records.append({
                    'product_id': [product_id.id, product_id.name],
                    'category_id': [product_id.id, product_id.categ_id.name],
                    'used_qty': each.get('qty'),
                    'quantity': product_id.with_context(
                        {'location': stock_location.id, 'compute_child': False}).qty_available,
                    'uom_name': product_id.uom_id.name or ''
                })
            if inventory_records:
                temp_list = []
                temp_obj = []
                for each in inventory_records:
                    if each.get('product_id')[0] not in temp_list:
                        temp_list.append(each.get('product_id')[0])
                        temp_obj.append(each)
                    else:
                        for rec in temp_obj:
                            if rec.get('product_id')[0] == each.get('product_id')[0]:
                                qty = rec.get('quantity') + each.get('quantity')
                                rec.update({'quantity': qty})
                final_list = sorted(temp_obj, key=lambda k: k['quantity'])
        return final_list or []

    def get_proxy_ip(self):
        proxy_id = self.env['res.users'].browse([self._uid]).company_id.report_ip_address
        return {'ip': proxy_id or False}

    def get_user(self):
        if self._uid == SUPERUSER_ID:
            return True

    def get_gross_total(self):
        gross_total = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                for line in order.lines:
                    gross_total += line.qty * (line.price_unit - line.product_id.standard_price)
        return gross_total

    def get_product_cate_total(self):
        balance_end_real = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                for line in order.lines:
                    balance_end_real += (line.qty * line.price_unit)
        return balance_end_real

    def get_net_gross_total(self):
        net_gross_profit = 0.0
        if self:
            net_gross_profit = self.get_gross_total() - self.get_total_tax()
        return net_gross_profit

    def get_product_name(self, category_id):
        if category_id:
            category_name = self.env['pos.category'].browse([category_id]).name
            return category_name

    def get_payments(self):
        if self:
            statement_line_obj = self.env["account.bank.statement.line"]
            pos_order_obj = self.env["pos.order"]
            company_id = self.env['res.users'].browse([self._uid]).company_id.id
            pos_ids = pos_order_obj.search([('state', 'in', ['paid', 'invoiced', 'done']),
                                            ('company_id', '=', company_id), ('session_id', '=', self.id)])
            data = {}
            if pos_ids:
                pos_ids = [pos.id for pos in pos_ids]
                st_line_ids = statement_line_obj.search([('pos_statement_id', 'in', pos_ids)])
                if st_line_ids:
                    a_l = []
                    for r in st_line_ids:
                        a_l.append(r['id'])
                    self._cr.execute(
                        "select aj.name,sum(amount) from account_bank_statement_line as absl,account_bank_statement as abs,account_journal as aj " \
                        "where absl.statement_id = abs.id and abs.journal_id = aj.id  and absl.id IN %s " \
                        "group by aj.name ", (tuple(a_l),))

                    data = self._cr.dictfetchall()
                    return data
            else:
                return {}

    def get_product_category(self):
        product_list = []
        if self and self.order_ids:
            for order in self.order_ids:
                for line in order.lines:
                    flag = False
                    product_dict = {}
                    for lst in product_list:
                        if line.product_id.pos_categ_id:
                            if lst.get('pos_categ_id') == line.product_id.pos_categ_id.id:
                                lst['price'] = lst['price'] + (line.qty * line.price_unit)
                                flag = True
                        else:
                            if lst.get('pos_categ_id') == '':
                                lst['price'] = lst['price'] + (line.qty * line.price_unit)
                                flag = True
                    if not flag:
                        product_dict.update({
                            'pos_categ_id': line.product_id.pos_categ_id and line.product_id.pos_categ_id.id or '',
                            'price': (line.qty * line.price_unit)
                        })
                        product_list.append(product_dict)
        return product_list

    def get_payments_amount(self):
        payments_amount = []
        for payment_method in self.config_id.payment_method_ids:
            payments = self.env['pos.payment'].search([
                ('session_id', '=', self.id),
                ('payment_method_id', '=', payment_method.id)
            ])
            journal_dict = {
                'name': payment_method.name,
                'amount': 0
            }
            for payment in payments:
                amount = payment.amount
                journal_dict['amount'] += amount
            payments_amount.append(journal_dict)
        return payments_amount

    def get_total_closing(self):
        if self:
            return self.cash_register_balance_end_real

    def get_total_sales(self):
        total_price = 0.0
        if self:
            for order in self.order_ids:
                if order.amount_paid >= 0:
                    total_price += sum([(line.qty * line.price_unit) for line in order.lines])
        return total_price

    def get_total_reversal(self):
        total_price = 0.0
        if self:
            for order in self.order_ids:
                if order.amount_paid <= 0:
                    total_price += order.amount_paid
        return total_price

    def get_reversal_orders_detail(self):
        reversal_orders_detail = {}
        if self:
            for order in self.order_ids:
                if order.amount_paid <= 0:
                    reversal_orders_detail[order.name] = []
                    for line in order.lines:
                        reversal_orders_detail[order.name].append({
                            'product_id': line.product_id.display_name,
                            'qty': line.qty,
                            'price_subtotal_incl': line.price_subtotal_incl,
                        })
        return reversal_orders_detail

    def get_total_tax(self):
        if self:
            total_tax = 0.0
            for order in self.order_ids:
                total_tax += order.amount_tax
        return total_tax

    def get_vat_tax(self):
        taxes_info = []
        if self:
            tax_list = [tax.id for order in self.order_ids for line in
                        order.lines.filtered(lambda line: line.tax_ids_after_fiscal_position) for tax in
                        line.tax_ids_after_fiscal_position]
            tax_list = list(set(tax_list))
            for tax in self.env['account.tax'].browse(tax_list):
                total_tax = 0.00
                net_total = 0.00
                for line in self.env['pos.order.line'].search(
                        [('order_id', 'in', [order.id for order in self.order_ids])]).filtered(
                    lambda line: tax in line.tax_ids_after_fiscal_position):
                    total_tax += line.price_subtotal * tax.amount / 100
                    net_total += line.price_subtotal
                taxes_info.append({
                    'tax_name': tax.name,
                    'tax_total': total_tax,
                    'tax_per': tax.amount,
                    'net_total': net_total,
                    'gross_tax': total_tax + net_total
                })
        return taxes_info

    def get_total_discount(self):
        total_discount = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                total_discount += sum([((line.qty * line.price_unit) * line.discount) / 100 for line in order.lines])
                total_discount += sum([line.price_extra for line in order.lines])
        return total_discount

    def get_total_discount_value(self):
        total_discount = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                total_discount += sum([line.price_extra for line in order.lines])
        return total_discount

    def get_sale_summary_by_user(self):
        user_summary = {}
        for order in self.order_ids:
            for line in order.lines:
                if line.user_id:
                    if not user_summary.get(line.user_id.name, None):
                        user_summary[line.user_id.name] = line.price_subtotal_incl
                    else:
                        user_summary[line.user_id.name] += line.price_subtotal_incl
                else:
                    if not user_summary.get(order.user_id.name, None):
                        user_summary[order.user_id.name] = line.price_subtotal_incl
                    else:
                        user_summary[order.user_id.name] += line.price_subtotal_incl
        return user_summary

    def get_total_refund(self):
        refund_total = 0.0
        if self and self.order_ids:
            for order in self.order_ids:
                if order.amount_total < 0:
                    refund_total += order.amount_total
        return refund_total

    def get_total_first(self):
        return sum(order.amount_total for order in self.order_ids)
