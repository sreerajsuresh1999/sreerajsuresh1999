# -*- coding: utf-8 -*-
from odoo import models, fields, api, _
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

import logging

_logger = logging.getLogger(__name__)


class pos_order(models.Model):
    _inherit = "pos.order"

    voucher_id = fields.Many2one('pos.voucher', 'Voucher Used')

    @api.model
    def _order_fields(self, ui_order):
        order_fields = super(pos_order, self)._order_fields(ui_order)
        if ui_order.get('voucher_id', False):
            order_fields.update({
                'voucher_id': ui_order['voucher_id']
            })
        return order_fields


class pos_voucher(models.Model):
    _name = "pos.voucher"
    _rec_name = 'code'
    _order = 'end_date'
    _description = "Management POS voucher"
    
    customer_id = fields.Many2one('res.partner', string='Customer')
    code = fields.Char('Ean13')
    start_date = fields.Datetime('Start Date', required=1, default=lambda self: fields.Datetime.now())
    end_date = fields.Datetime('Expired Date', required=1,
                               default=lambda self: fields.Datetime.now() + relativedelta(days=365))
    state = fields.Selection([
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('used', 'Used'),
        ('removed', 'Removed')
    ], string='State', default='draft')
    value = fields.Float('Balance Value')
    apply_type = fields.Selection([
        ('fixed_amount', 'Fixed amount'),
        ('percent', 'Percent (%)'),
    ], string='Apply', default='fixed_amount')
    method = fields.Selection([
        ('general', 'General'),
        ('special_customer', 'Special Customer'),
    ], string='Method', default='general')
    use_date = fields.Datetime('Use Date')
    user_id = fields.Many2one('res.users', 'Create User', readonly=1)
    source = fields.Char('Source Document')
    pos_order_id = fields.Many2one('pos.order', 'Order', readonly=1)
    pos_order_line_id = fields.Many2one('pos.order.line', 'Order Line', readonly=1)
    use_history_ids = fields.One2many('pos.voucher.use.history', 'voucher_id', string='Histories Used', readonly=1)
    number = fields.Char('Number')

    def import_voucher(self, vals):
        vouchers_existing = self.search([
            '|',
            ('code', '=', vals.get('code')),
            ('number', '=', vals.get('number'))
        ])
        if vouchers_existing:
            vouchers_existing.write(vals)
        else:
            self.create(vals)
        return True

    def set_active(self):
        return self.write({'state': 'active'})

    def set_cancel(self):
        return self.write({'state': 'removed'})

    def create_from_ui(self, voucher_vals):
        today = datetime.today()
        end_date = today + timedelta(days=int(voucher_vals['period_days']))
        new_voucher = self.create({
            'number': voucher_vals.get('number'),
            'apply_type': voucher_vals.get('apply_type'),
            'method': voucher_vals.get('method'),
            'value': voucher_vals.get('value'),
            'state': voucher_vals.get('state'),
            'start_date': today,
            'end_date': end_date,
            'user_id': self.env.user.id
        })
        return {
            'number': new_voucher.number,
            'code': new_voucher.code,
            'partner_name': new_voucher.customer_id.name if new_voucher.customer_id else '',
            'method': new_voucher.method,
            'apply_type': new_voucher.apply_type,
            'value': new_voucher.value,
            'start_date': new_voucher.start_date,
            'end_date': new_voucher.end_date,
            'id': new_voucher.id,
        }

    def get_vouchers_by_order_ids(self, order_ids):
        vouchers_data = []
        orders = self.env['pos.order'].sudo().browse(order_ids)
        for order in orders:
            line_ids = [line.id for line in order.lines]
            vouchers = self.sudo().search([('pos_order_line_id', 'in', line_ids)])
            for voucher in vouchers:
                vouchers_data.append({
                    'number': voucher.number,
                    'code': voucher.code,
                    'partner_name': voucher.customer_id.name if voucher.customer_id else '',
                    'method': voucher.method,
                    'apply_type': voucher.apply_type,
                    'value': voucher.value,
                    'start_date': voucher.start_date,
                    'end_date': voucher.end_date,
                    'id': voucher.id,
                })
        return vouchers_data

    @api.model
    def create(self, vals):
        voucher = super(pos_voucher, self).create(vals)
        if not voucher.code:
            format_code = "%s%s%s" % ('999', voucher.id, datetime.now().strftime("%d%m%y%H%M"))
            code = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            voucher.write({'code': code})
            if not voucher.number:
                voucher.write({'number': voucher.code})
        _logger.info('NEW VOUCHER: %s' % voucher.number)
        return voucher

    def randomEan13(self):
        codes = []
        for i in range(1, 1001):
            format_code = "%s%s%s" % ('999', i, datetime.now().strftime("%d%m%y%H%M"))
            code = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            codes.append(code)
        _logger.info(codes)
        return codes


    def remove_voucher(self):
        return self.write({
            'state': 'removed'
        })

    @api.model
    def get_voucher_by_code(self, code):
        _logger.info('get voucher code: %s' % code)
        vouchers = self.env['pos.voucher'].search([
            '|',
            ('code', '=', code), ('number', '=', code),
            ('end_date', '>=', fields.Datetime.now()),
            ('state', '=', 'active')
        ])
        if not vouchers:
            return -1
        else:
            return vouchers.read([])[0]


class pos_voucher_use_history(models.Model):
    _name = "pos.voucher.use.history"
    _description = "Histories use voucher of customer"

    pos_order_id = fields.Many2one('pos.order', string='Order')
    payment_id = fields.Many2one('pos.payment', string='Payment')
    voucher_id = fields.Many2one('pos.voucher', required=1, string='Voucher', ondelete='cascade')
    value = fields.Float('Value Redeem', required=1)
    used_date = fields.Datetime('Used Date', required=1)
    cashier_id = fields.Many2one('res.users', 'Cashier Added')
