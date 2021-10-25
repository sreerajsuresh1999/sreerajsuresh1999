# -*- coding: utf-8 -*-
from odoo import fields, api, models
from datetime import datetime
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT

import logging

_logger = logging.getLogger(__name__)

class pos_order(models.Model):
    _inherit = 'pos.order'

    @api.model
    def product_summary_report(self, vals):
        result = {
            'product_summary': {},
            'category_summary': {},
            'payment_summary': {},
            'location_summary': {},
        }
        if not vals:
            return result
        else:
            product_summary_dict = {}
            category_summary_dict = {}
            payment_summary_dict = {}
            location_summary_dict = {}
            product_qty = 0
            location_qty = 0
            category_qty = 0
            payment = 0
            if vals.get('session_id'):
                orders = self.sudo().search([('session_id', '=', vals.get('session_id'))])
            else:
                orders = self.sudo().search([
                    ('date_order', '>=', vals.get('from_date')),
                    ('date_order', '<=', vals.get('to_date')),
                    ('company_id', '=', self.env.user.company_id.id)
                ])
            location_list = []
            for each_order in orders:
                if 'location_summary' in vals.get('summary', []) or len(vals.get('summary')) == 0:
                    for picking in each_order.picking_ids:
                        if not location_summary_dict.get(picking.location_id.name, None):
                            location_summary_dict[picking.location_id.name] = {}
                for each_order_line in each_order.lines:
                    if 'product_summary' in vals.get('summary', []) or len(vals.get('summary')) == 0:
                        if not product_summary_dict.get(each_order_line.product_id.id, None):
                            product_summary_dict[each_order_line.product_id.id] = {
                                'name': each_order_line.product_id.name,
                                'quantity':0
                            }
                        product_summary_dict[each_order_line.product_id.id]['quantity'] += each_order_line.qty
                    if 'category_summary' in vals.get('summary', []) or len(vals.get('summary')) == 0:
                        if each_order_line.product_id.pos_categ_id.name in category_summary_dict:
                            category_qty = category_summary_dict[each_order_line.product_id.pos_categ_id.name]
                            category_qty += each_order_line.qty
                        else:
                            category_qty = each_order_line.qty
                        category_summary_dict[each_order_line.product_id.pos_categ_id.name] = category_qty;
                    if 'payment_summary' in vals.get('summary', []) or len(vals.get('summary')) == 0:
                        for payment in each_order.payment_ids:
                            if not payment_summary_dict.get(payment.payment_method_id.name, None):
                                payment_summary_dict[payment.payment_method_id.name] = 0
                            payment_summary_dict[payment.payment_method_id.name] += payment.amount
            if 'location_summary' in vals.get('summary', []) or len(vals.get('summary')) == 0:
                for each_order in orders:
                    for picking in each_order.picking_ids:
                        for each_order_line in each_order.lines:
                            if each_order_line.product_id.name in location_summary_dict[
                                picking.location_id.name]:
                                location_qty = location_summary_dict[picking.location_id.name][
                                    each_order_line.product_id.name]
                                location_qty += each_order_line.qty
                            else:
                                location_qty = each_order_line.qty
                            location_summary_dict[picking.location_id.name][
                                each_order_line.product_id.name] = location_qty
                location_list.append(location_summary_dict)

            return {
                'product_summary': product_summary_dict,
                'category_summary': category_summary_dict,
                'payment_summary': payment_summary_dict,
                'location_summary': location_summary_dict,
            }

    @api.model
    def payment_summary_report(self, vals={}):
        if not vals.get('summary', None):
            vals['summary'] = 'sales_person'
        journals_detail = {}
        salesmen_detail = {}
        summary_data = {}
        if vals.get('session_id'):
            order_detail = self.sudo().search([('session_id', '=', vals.get('session_id'))])
        else:
            order_detail = self.sudo().search([
                ('date_order', '>=', vals.get('from_date')),
                ('date_order', '<=', vals.get('to_date')),
                ('company_id', '=', self.env.user.company_id.id)
            ])
        if vals.get('summary', None) == 'journals':
            if (order_detail):
                for each_order in order_detail:
                    order_date = each_order.date_order
                    date1 = order_date
                    date1 = date1.strftime(DEFAULT_SERVER_DATETIME_FORMAT)
                    month_year = datetime.strptime(date1, DEFAULT_SERVER_DATETIME_FORMAT).strftime("%B-%Y")
                    if not month_year in journals_detail:
                        journals_detail[month_year] = {}
                    for payment in each_order.payment_ids:
                        if not journals_detail[month_year].get(payment.payment_method_id.name, None):
                            journals_detail[month_year][payment.payment_method_id.name] = payment.amount
                        else:
                            journals_detail[month_year][payment.payment_method_id.name] += payment.amount
                for journal in journals_detail.values():
                    for i in journal:
                        if i in summary_data:
                            total = journal[i] + summary_data[i]
                        else:
                            total = journal[i]
                        summary_data[i] = float(format(total, '2f'));

        if vals.get('summary', None) == 'sales_person':
            if (order_detail):
                for each_order in order_detail:
                    order_date = each_order.date_order
                    date1 = order_date
                    date1 = date1.strftime(DEFAULT_SERVER_DATETIME_FORMAT)
                    month_year = datetime.strptime(date1, DEFAULT_SERVER_DATETIME_FORMAT).strftime("%B-%Y")
                    if not salesmen_detail.get(each_order.user_id.name, {}):
                        salesmen_detail[each_order.user_id.name] = {}
                    if not salesmen_detail[each_order.user_id.name].get(month_year, {}):
                        salesmen_detail[each_order.user_id.name][month_year] = {}
                    for payment in each_order.payment_ids:
                        if not salesmen_detail[each_order.user_id.name][month_year].get(payment.payment_method_id.name,
                                                                                        None):
                            salesmen_detail[each_order.user_id.name][month_year][payment.payment_method_id.name] = 0
                        salesmen_detail[each_order.user_id.name][month_year][
                            payment.payment_method_id.name] += payment.amount

        return {
            'journal_details': journals_detail,
            'salesmen_details': salesmen_detail,
            'summary_data': summary_data
        }

    @api.model
    def order_summary_report(self, vals):
        _logger.info(vals)
        order_list = {}
        category_list = {}
        payment_list = {}
        if vals:
            orders = []
            if vals.get('session_id'):
                orders = self.sudo().search([
                    ('session_id', '=', vals.get('session_id'))
                ])
            else:
                orders = self.sudo().search([
                    ('date_order', '>=', vals.get('from_date')),
                    ('date_order', '<=', vals.get('to_date')),
                    ('company_id', '=', self.env.user.company_id.id)
                ])

            if ('order_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                for each_order in orders:
                    order_list[each_order.state] = []
                for each_order in orders:
                    if each_order.state in order_list:
                        order_list[each_order.state].append({
                            'order_ref': each_order.name,
                            'order_date': each_order.date_order,
                            'total': float(format(each_order.amount_total, '.2f'))
                        })
                    else:
                        order_list.update({
                            each_order.state.append({
                                'order_ref': each_order.name,
                                'order_date': each_order.date_order,
                                'total': float(format(each_order.amount_total, '.2f'))
                            })
                        })
            if ('category_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                count = 0.00
                amount = 0.00
                for each_order in orders:
                    category_list[each_order.state] = {}
                for each_order in orders:
                    for order_line in each_order.lines:
                        if each_order.state == 'paid':
                            if order_line.product_id.pos_categ_id.name in category_list[each_order.state]:
                                count = category_list[each_order.state][order_line.product_id.pos_categ_id.name][0]
                                amount = category_list[each_order.state][order_line.product_id.pos_categ_id.name][1]
                                count += order_line.qty
                                amount += order_line.price_subtotal_incl
                            else:
                                count = order_line.qty
                                amount = order_line.price_subtotal_incl
                        if each_order.state == 'done':
                            if order_line.product_id.pos_categ_id.name in category_list[each_order.state]:
                                count = category_list[each_order.state][order_line.product_id.pos_categ_id.name][0]
                                amount = category_list[each_order.state][order_line.product_id.pos_categ_id.name][1]
                                count += order_line.qty
                                amount += order_line.price_subtotal_incl
                            else:
                                count = order_line.qty
                                amount = order_line.price_subtotal_incl
                        if each_order.state == 'invoiced':
                            if order_line.product_id.pos_categ_id.name in category_list[each_order.state]:
                                count = category_list[each_order.state][order_line.product_id.pos_categ_id.name][0]
                                amount = category_list[each_order.state][order_line.product_id.pos_categ_id.name][1]
                                count += order_line.qty
                                amount += order_line.price_subtotal_incl
                            else:
                                count = order_line.qty
                                amount = order_line.price_subtotal_incl
                        category_list[each_order.state].update(
                            {order_line.product_id.pos_categ_id.name: [count, amount]})
                    if (False in category_list[each_order.state]):
                        category_list[each_order.state]['others'] = category_list[each_order.state].pop(False)

            if ('payment_summary_report' in vals['summary'] or len(vals['summary']) == 0):
                for each_order in orders:
                    if not payment_list.get(each_order.state, None):
                        payment_list[each_order.state] = {}
                    for payment in each_order.payment_ids:
                        if not payment_list[each_order.state].get(payment.payment_method_id.name, None):
                            payment_list[each_order.state][payment.payment_method_id.name] = 0
                        payment_list[each_order.state][payment.payment_method_id.name] += payment.amount
            return {
                'order_report': order_list,
                'category_report': category_list,
                'payment_report': payment_list,
                'state': vals['state']
            }
