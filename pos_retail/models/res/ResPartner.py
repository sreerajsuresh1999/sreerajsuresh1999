# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
from datetime import datetime


import logging

_logger = logging.getLogger(__name__)


class res_partner_type(models.Model):
    _name = "res.partner.type"
    _description = "Type of partner, filter by amount total bought from your shops"

    name = fields.Char('Name', required=1)
    from_amount_total_orders = fields.Float('From amount total', help='Min of total amount bought from your shop')
    to_amount_total_orders = fields.Float('To amount total', help='Max of total amount bought from your shop')

    def get_type_from_total_amount(self, amount):
        types = self.search([])
        type_will_add = None
        for type in types:
            if amount >= type.from_amount_total_orders and amount <= type.to_amount_total_orders:
                type_will_add = type.id
        return type_will_add


class res_partner(models.Model):
    _inherit = "res.partner"

    wallet = fields.Float(
        digits=(16, 4),
        compute='_compute_wallet',
        string='Wallet Amount',
        help='This wallet amount of customer, keep all money change when paid order on pos')
    credit = fields.Float(
        digits=(16, 4),
        compute='_compute_debit_credit_balance',
        string='Credit',
        help='Credit amount of this customer can use')
    debit = fields.Float(
        digits=(16, 4),
        compute='_compute_debit_credit_balance',
        string='Debit',
        help='Debit amount of this customer')
    balance = fields.Float(
        digits=(16, 4),
        compute='_compute_debit_credit_balance',
        string='Balance',
        help='Balance amount customer can use paid on pos')
    limit_debit = fields.Float(
        'Limit Debit',
        help='Limit credit amount can add to this customer')
    credit_history_ids = fields.One2many(
        'res.partner.credit',
        'partner_id',
        'Credit Histories')
    pos_loyalty_point_import = fields.Float(
        'Loyalty Points Import',
        default=0,
        help='Admin system can import point for this customer')
    pos_loyalty_point = fields.Float(
        digits=(16, 4),
        compute="_get_point",
        string='Loyalty Points Total',
        help='Total point of customer can use reward program of pos system')
    pos_loyalty_type = fields.Many2one(
        'pos.loyalty.category',
        'Loyalty Type',
        help='Customer type of loyalty program')
    pos_loyalty_point_ids = fields.One2many(
        'pos.loyalty.point',
        'partner_id',
        'Point Histories')
    discount_id = fields.Many2one(
        'pos.global.discount',
        'Pos discount',
        help='Discount (%) automatic apply for this customer')
    birthday_date = fields.Date('Birthday Date')
    group_ids = fields.Many2many(
        'res.partner.group',
        'res_partner_group_rel',
        'partner_id',
        'group_id',
        string='Groups Name')
    pos_order_ids = fields.One2many(
        'pos.order',
        'partner_id',
        'POS Order')
    pos_total_amount = fields.Float(
        'POS Amount Total',
        help='Total amount customer bought from your shop',
        compute='_getTotalPosOrder')
    pos_partner_type_id = fields.Many2one(
        'res.partner.type',
        string='POS Partner Type',
        compute='_getTotalPosOrder',
        readonly=1)
    pos_branch_id = fields.Many2one(
        'pos.branch',
        'Branch')
    special_name = fields.Char('Special Name')

    def _getTotalPosOrder(self):
        for partner in self:
            partner.pos_total_amount = 0
            for o in partner.pos_order_ids:
                partner.pos_total_amount += o.amount_total
            type_will_add = self.env['res.partner.type'].sudo().get_type_from_total_amount(partner.pos_total_amount)
            if not type_will_add:
                type_will_add = None
            partner.pos_partner_type_id = type_will_add

    def update_branch_to_partner(self, vals):
        for partner in self:
            if not partner.pos_branch_id:
                partner.write(vals)
        return True

    def add_barcode(self):
        barcode_rules = self.env['barcode.rule'].sudo().search([
            ('type', '=', 'client'),
            ('pattern', '!=', '.*'),
        ])
        barcode = None
        if barcode_rules:
            for partner in self:
                format_code = "%s%s%s" % (barcode_rules[0].pattern, partner.id, datetime.now().strftime("%d%m%y%H%M"))
                barcode = self.env['barcode.nomenclature'].sanitize_ean(format_code)
                partner.write({'barcode': barcode})
        return barcode

    @api.model
    def create_from_ui(self, partner):
        if partner.get('birthday_date', None):
            birthday_date = datetime.strptime(partner.get('birthday_date'), "%d-%m-%Y")
            partner.update({'birthday_date': birthday_date})
        if partner.get('property_product_pricelist', False):
            partner['property_product_pricelist'] = int(partner['property_product_pricelist'])
        for key, value in partner.items():
            if value == "false":
                partner[key] = False
            if value == "true":
                partner[key] = True
        return super(res_partner, self).create_from_ui(partner)

    def _get_point(self):
        for partner in self:
            partner.pos_loyalty_point = partner.pos_loyalty_point_import
            for loyalty_point in partner.pos_loyalty_point_ids:
                if loyalty_point.type == 'redeem':
                    partner.pos_loyalty_point -= loyalty_point.point
                else:
                    partner.pos_loyalty_point += loyalty_point.point

    def _compute_debit_credit_balance(self):
        for partner in self:
            partner.credit = 0
            partner.debit = 0
            partner.balance = 0
            orders_partial = self.env['pos.order'].search([
                ('state', '=', 'draft'),
                ('partial_payment', '=', True),
                ('partner_id', '=', partner.id)
            ])
            for o in orders_partial:
                debit = o.amount_total - o.amount_paid
                partner.debit += debit
            for credit in partner.credit_history_ids:
                if credit.type == 'plus':
                    partner.credit += credit.amount
                if credit.type == 'redeem':
                    partner.debit += credit.amount
            partner.balance = partner.credit + partner.limit_debit - partner.debit
        return True

    def _compute_wallet(self):
        for partner in self:
            if partner.id:
                partner.wallet = 0
                self.env.cr.execute("""
                SELECT sum(pp.amount)
                FROM 
                    pos_payment AS pp,
                    pos_payment_method AS ppm,
                    pos_order AS po,
                    res_partner AS rp,
                    account_journal AS aj
                WHERE
                    rp.id=%s
                    AND rp.id=po.partner_id
                    AND pp.pos_order_id=po.id
                    AND aj.id=ppm.cash_journal_id
                    AND ppm.id=pp.payment_method_id
                    AND aj.pos_method_type = 'wallet'""" % partner.id)
                plus_wallet_datas = self.env.cr.fetchall()
                if len(plus_wallet_datas) == 1 and plus_wallet_datas[0] and plus_wallet_datas[0][0]:
                    partner.wallet = - (plus_wallet_datas[0][0])
            else:
                partner.wallet = 0

    @api.model
    def create(self, vals):
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        partner = super(res_partner, self).create(vals)
        if partner.birthday_date and (partner.birthday_date >= fields.Date.context_today(self)):
            raise UserError('Birth date could not bigger than today')
        self.env['pos.cache.database'].syncToPosOnline('res.partner', [partner.id])
        return partner

    def write(self, vals):
        res = super(res_partner, self).write(vals)
        partner_ids = []
        for partner in self:
            partner_ids.append(partner.id)
            if partner.birthday_date and (partner.birthday_date >= fields.Date.context_today(self)):
                raise UserError('Birth date could not bigger than today')
        self.env['pos.cache.database'].syncToPosOnline('res.partner', partner_ids)
        return res

    def unlink(self):
        partner_ids = []
        for partner in self:
            partner_ids.append(partner.id)
        self.env['pos.cache.database'].syncToPosOnline('res.partner', partner_ids)
        return super(res_partner, self).unlink()
