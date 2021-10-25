# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
from random import choice
from string import digits


class ProductPricelist(models.Model):
    _inherit = "product.pricelist"

    barcode = fields.Char('Barcode')

    def generate_random_barcode(self):
        for user in self:
            user.barcode = self.env['barcode.nomenclature'].sanitize_ean('074' + "".join(choice(digits) for i in range(9)))
            print (user.barcode)

    def write(self, vals):
        res = super(ProductPricelist, self).write(vals)
        self.env['pos.cache.database'].request_pos_sessions_online_reload_by_channel('pos.sync.pricelists')
        return res

    def unlink(self):
        for pricelist in self:
            orders = self.env['pos.order'].sudo().search([
                ('pricelist_id', '=', pricelist.id)
            ], limit=1)
            if orders:
                raise UserError('%s Used have save on many POS Orders, not allow remove it' % pricelist.name)
            pos_configs = self.env['pos.config'].sudo().search([
                ('pricelist_id', '=', pricelist.id)
            ], limit=1)
            if pos_configs:
                raise UserError('%s Used have used for POS Config, could not allow remove it' % pricelist.name)
            pos_sessions = self.env['pos.session'].sudo().search([
                ('state', '=', 'opened')
            ], limit=1)
            if pos_sessions:
                raise UserError('Please close all POS session before remove Pricelist')
        res = super(ProductPricelist, self).unlink()
        self.env['pos.cache.database'].request_pos_sessions_online_reload_by_channel('pos.sync.pricelists')
        return res


class ProductPricelistItem(models.Model):
    _inherit = "product.pricelist.item"

    uom_id = fields.Many2one('uom.uom', 'Unit of Measure')
    uom_ids = fields.Many2many('uom.uom', string='Units the same category', compute='_get_uoms_the_same_category')
    applied_on = fields.Selection(selection_add=[
        ('4_pos_category', 'POS Category'),
    ], ondelete={
        '4_pos_category': 'set default',
    })
    pos_category_id = fields.Many2one('pos.category', 'POS Category')
    min_price = fields.Float(
        'Min Price',
        help='Not allow POS Users set price smaller than it'
    )
    max_price = fields.Float(
        'Max Price',
        help='Not allow POS Users set price bigger than it'
    )

    @api.onchange('product_id')
    def onchange_product(self):
        if self.product_id:
            self.uom_id = self.product_id.uom_id
            uoms = self.env['uom.uom'].search([('category_id', '=', self.product_id.uom_id.category_id.id)])
            self.uom_ids = [(6, 0, [uom.id for uom in uoms])]

    def _get_uoms_the_same_category(self):
        for item in self:
            if item.product_id:
                uoms = self.env['uom.uom'].search([('category_id', '=', item.product_id.uom_id.category_id.id)])
                item.uom_ids = [(6, 0, [uom.id for uom in uoms])]
            else:
                item.uom_ids = [(6, 0, [])]

    def write(self, vals):
        res = super(ProductPricelistItem, self).write(vals)
        self.env['pos.cache.database'].request_pos_sessions_online_reload_by_channel('pos.sync.pricelists')
        return res

    def unlink(self):
        res = super(ProductPricelistItem, self).unlink()
        self.env['pos.cache.database'].request_pos_sessions_online_reload_by_channel('pos.sync.pricelists')
        return res
