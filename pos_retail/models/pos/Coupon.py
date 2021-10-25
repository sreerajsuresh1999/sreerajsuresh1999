# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError
import ast


class CouponProgram(models.Model):
    _inherit = "coupon.program"

    pos_order_count = fields.Integer(compute='_compute_pos_order_count')
    is_gift_card = fields.Boolean('Is Gift Card')
    maximum_cards_create = fields.Integer(
        'Maximum Cards Create',
        help='Maximum Gift Cards can create from POS'
    )
    description = fields.Text('Description')
    gift_product_id = fields.Many2one(
        'product.product',
        domain=[('sale_ok', '=', True), ('available_in_pos', '=', True)],
        string='Gift Product',
        help='Product will add to cart \n'
             'When sold out this product, 1 coupon program will print \n'
             'And your cashier can give Coupon code (pdf file) to customer'
    )

    @api.onchange('is_gift_card')
    def onchange_is_gift_card(self):
        if self.is_gift_card:
            self.program_type = 'coupon_program'
            self.reward_type = 'discount'
            self.discount_type = 'fixed_amount'

    @api.model
    def create(self, vals):
        if vals.get('is_gift_card') and \
                (vals.get('program_type', None) != 'coupon_program'
                 or vals.get('reward_type', None) != 'discount'
                 or vals.get('discount_type', None) != 'fixed_amount'):
            raise UserError(_(
                'Gift Card feature has actived required Program type is Coupon, Reward type is Discount and Discount type is Fixed Amount'))
        return super(CouponProgram, self).create(vals)

    def _compute_pos_order_count(self):
        for program in self:
            program.pos_order_count = len(self.env['pos.order.line'].search(
                ['|', ('coupon_program_id', '=', program.id), ('coupon_id.program_id', '=', program.id)]))

    def action_view_pos_orders(self):
        self.ensure_one()
        orders = self.env['pos.order.line'].search(
            ['|', ('coupon_program_id', '=', self.id), ('coupon_id.program_id', '=', self.id)]).mapped(
            'order_id')
        return {
            'name': _('POS Orders'),
            'view_mode': 'tree,form',
            'res_model': 'pos.order',
            'type': 'ir.actions.act_window',
            'domain': [('id', 'in', orders.ids)],
            'context': dict(self._context, create=False)
        }


class Coupon(models.Model):
    _inherit = 'coupon.coupon'

    pos_order_id = fields.Many2one('pos.order', 'Pos Order', readonly=1)
    origin = fields.Char('Origin')
    is_gift_card = fields.Boolean(string='Is Gift Card', related='program_id.is_gift_card', store=True)
    is_returned_order = fields.Boolean(string='Coverted from Return Order')
    redeem_history_ids = fields.One2many(
        'pos.order.line',
        'coupon_id',
        string='Redeem Histories',
        readonly=1,
    )
    state = fields.Selection(selection_add=[
        ('draft', 'Draft'),
    ], ondelete={
        'draft': 'set default',
    })
    pos_create_date = fields.Datetime('POS Create Date', readonly=1)
    pos_create_uid = fields.Many2one('res.users', 'POS User Create', readonly=1)
    pos_config_id = fields.Many2one('pos.config', 'POS Config Create', readonly=1)
    base_amount = fields.Float('Base Amount')
    redeem_amount = fields.Float('Redeem Amount', compute='_get_balance_amount')
    balance_amount = fields.Float('Balance Amount', compute='_get_balance_amount')
    pos_orderline_id = fields.Many2one('pos.order.line', 'Pos Order Line', readonly=1)

    def _get_balance_amount(self):
        for coupon in self:
            coupon.redeem_amount = - sum([line.price_subtotal for line in coupon.redeem_history_ids])
            coupon.balance_amount = coupon.base_amount - coupon.redeem_amount

    @api.model
    def create(self, vals):
        if not vals.get('base_amount', None) and vals.get('program_id', None):
            program = self.env['coupon.program'].browse(vals.get('program_id'))
            if program.reward_type == 'discount' and program.discount_type == 'fixed_amount' and program.discount_fixed_amount > 0:
                vals['base_amount'] = program.discount_fixed_amount
        coupon = super(Coupon, self).create(vals)
        return coupon


class CouponRule(models.Model):
    _inherit = 'coupon.rule'

    applied_partner_ids = fields.Many2many('res.partner', compute='_getAppliedPartnerIds')
    applied_product_ids = fields.Many2many('product.product', compute='_getAppliedProductIds')

    # ---------------- API for POS -----------------------------#
    def getPartnersAppliedWithRule(self, rule_id):
        self = self.browse(rule_id)
        if self.rule_partners_domain:
            return {
                'id': self.id,
                'datas': [p.id for p in
                          self.env['res.partner'].sudo().search(ast.literal_eval(self.rule_partners_domain))]
            }
        else:
            return {
                'id': self.id,
                'datas': [p.id for p in self.env['res.partner'].sudo().search([])]
            }

    def getProductsAppliedWithRule(self, rule_id):
        self = self.browse(rule_id)
        if self.rule_products_domain:
            return {
                'id': self.id,
                'datas': [p.id for p in
                          self.env['product.product'].sudo().search(ast.literal_eval(self.rule_products_domain))]
            }
        else:
            return {
                'id': self.id,
                'datas': [p.id for p in self.env['product.product'].sudo().search([])]
            }

    # ---------------- END API for POS -----------------------------#

    def _getAppliedPartnerIds(self):
        for rule in self:
            if rule.rule_partners_domain:
                rule.applied_partner_ids = [
                    [6, 0, [p.id for p in
                            self.env['res.partner'].sudo().search(ast.literal_eval(rule.rule_partners_domain))]]]
            else:
                rule.applied_partner_ids = [
                    [6, 0, [p.id for p in self.env['res.partner'].sudo().search([])]]]

    def _getAppliedProductIds(self):
        for rule in self:
            if rule.rule_products_domain:
                rule.applied_product_ids = [
                    [6, 0, [p.id for p in
                            self.env['product.product'].sudo().search(ast.literal_eval(rule.rule_products_domain))]]]
            else:
                rule.applied_product_ids = [
                    [6, 0, [p.id for p in self.env['product.product'].sudo().search([])]]]
