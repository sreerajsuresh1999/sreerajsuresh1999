# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class PosComboLimit(models.Model):
    _name = "pos.combo.limit"
    _description = "Combo Limit Items"

    product_tmpl_id = fields.Many2one(
        'product.template',
        'Product',
        required=True
    )
    pos_categ_id = fields.Many2one(
        'pos.category',
        string='POS Category',
        required=True,
    )
    quantity_limited = fields.Integer(
        'Quantity Limited',
        default=10,
        required=True,
        help='Total Quantity Items of this Category can add to Combo'
    )
    default_product_ids = fields.Many2many(
        'product.product',
        'pos_combo_limit_product_product_rel',
        'combo_limit_id',
        'product_id',
        string='Default Items',
        help='Default Items automatic add to Combo, when cashier add this Combo to Order Cart'
    )

class PosComboItem(models.Model):
    _name = "pos.combo.item"
    _rec_name = "product_id"
    _description = "Management Product Pack/Combo"

    required = fields.Boolean('Is Required', default=0)
    product_id = fields.Many2one(
        'product.product',
        'Product',
        required=True,
        domain=[('available_in_pos', '=', True)])
    product_combo_id = fields.Many2one(
        'product.template',
        'Combo',
        required=True,
        domain=[('available_in_pos', '=', True)])
    quantity = fields.Float(
        'Quantity',
        required=1,
        default=1)
    price_extra = fields.Float(
        'Price Extra',
        help='This price will plus to sale price of product combo')
    default = fields.Boolean(
        'Default Selected',
        default=1)
    tracking = fields.Boolean(
        'Tracking Lot/Serial',
        help='Allow cashier set serial/lot to combo items')
    uom_id = fields.Many2one(
        'uom.uom', 'Unit of measure')

    @api.model
    def create(self, vals):
        if vals.get('quantity', 0) < 0:
            raise UserError('Quantity can not smaller 0')
        return super(PosComboItem, self).create(vals)

    def write(self, vals):
        if vals.get('quantity', 0) < 0:
            raise UserError('Quantity can not smaller 0')
        return super(PosComboItem, self).write(vals)

    @api.onchange('product_id')
    def onchange_product_id(self):
        if self.product_id and self.product_id.uom_id:
            self.uom_id = self.product_id.uom_id
