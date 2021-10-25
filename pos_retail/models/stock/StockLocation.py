# -*- coding: utf-8 -*-
from odoo import fields, api, models

import logging
import odoo
import time

_logger = logging.getLogger(__name__)


class StockLocation(models.Model):
    _inherit = "stock.location"

    pos_branch_id = fields.Many2one('pos.branch', string='Branch')
    location_address_id = fields.Many2one(
        'res.partner',
        string='Location Address'
    )

    @api.model
    def create(self, vals):
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        location = super(StockLocation, self).create(vals)
        return location

    def pos_update_stock_on_hand_by_location_id(self, vals={}):
        self.env['stock.quant'].with_context(inventory_mode=True).create({
            'product_id': vals['product_id'],
            'location_id': vals['location_id'],
            'inventory_quantity': vals['quantity'],
        })
        location = self.env['stock.location'].browse(vals['location_id'])
        product = self.env['product.product'].with_context({'location': location.id}).browse(vals.get('product_id'))
        return {
            'location': location.name,
            'product': product.display_name,
            'quantity': product.qty_available
        }

    def _get_child_locations(self, location_id, location_ids=[]):
        location = self.browse(location_id)
        if location.child_ids:
            location_ids = list(set(location_ids + [child.id for child in location.child_ids]))
            for child in location.child_ids:
                if child.usage == 'internal':
                    child_location_ids = self._get_child_locations(child.id, location_ids)
                    location_ids = list(set(location_ids + child_location_ids))
        return location_ids

    # TODO: change at 3.12.2020
    # def get_stock_data_by_location_ids(self, product_ids=[], location_ids=[]):
    #     _logger.info('[get_stock_data_by_location_ids] locations: %s products: %s ' % (location_ids, product_ids))
    #     stock_datas = {}
    #     if len(product_ids) == 0:
    #         product_ids = self.env['product.product'].search(
    #             [('available_in_pos', '=', True), ('type', '!=', 'service')])
    #     else:
    #         product_ids = self.env['product.product'].browse(product_ids)
    #     for location_id in location_ids:
    #         stock_datas[location_id] = {}
    #         # location = self.env['stock.location'].browse(location_id)
    #         for product in product_ids:
    #             # qty_available = self.env['stock.quant'].sudo()._get_available_quantity(product, location)
    #             product.with_context(location=location_id)
    #             qty_available = product.qty_available
    #             stock_datas[location_id][product.id] = qty_available
    #             # _logger.info(
    #             #     'Location ID: [%s] with Product - ID [%s - %s] has stock on hand %s' % (
    #             #     location_id, product.name, product.id,
    #             #     qty_available))
    #     return stock_datas

    # TODO: change at 2.12.2020
    # def get_stock_data_by_location_ids(self, product_ids=[], location_ids=[]):
    #     stock_datas = {}
    #     if len(product_ids) == 0:
    #         product_ids = self.env['product.product'].search(
    #             [('available_in_pos', '=', True), ('type', '!=', 'service')])
    #     else:
    #         product_ids = self.env['product.product'].browse(product_ids)
    #     for location_id in location_ids:
    #         stock_datas[location_id] = {}
    #         location = self.env['stock.location'].browse(location_id)
    #         for product in product_ids:
    #             qty_available = self.env['stock.quant'].sudo()._get_available_quantity(product, location)
    #             stock_datas[location_id][product.id] = qty_available
    #             _logger.info(
    #                 'Location: [%s] with Product - ID [%s - %s] has stock on hand %s' % (
    #                 location.display_name, product.name, product.id,
    #                 qty_available))
    #     return stock_datas

    # TODO: before 2.12.2020
    # TODO: 07.02.2020 supported product KIT (https://www.odoo.com/documentation/user/14.0/manufacturing/management/kit_shipping.html)
    def getStockDatasByLocationIds(self, product_ids=[], location_ids=[]):
        productHasRemovedIds = []
        stock_datas = {}
        for location_id in location_ids:
            stock_datas[location_id] = {}
            location_ids = self._get_child_locations(location_id, [])
            location_ids.append(location_id)
            if len(location_ids) == 1:
                location_ids.append(0)
            if len(product_ids) == 1:
                product_ids.append(0)
            if len(location_ids) == 0:
                continue
            if not product_ids:
                sql = "SELECT pp.id FROM product_product as pp, product_template as pt where pp.product_tmpl_id=pt.id and pt.type = 'product'"
                self.env.cr.execute(sql)
                products = self.env.cr.dictfetchall()
                product_ids = [p.get('id') for p in products]
            for product_id in product_ids:
                sql = "SELECT sum(quantity - reserved_quantity) FROM stock_quant where location_id in %s AND product_id = %s"
                self.env.cr.execute(sql, (tuple(location_ids), product_id,))
                datas = self.env.cr.dictfetchall()
                stock_datas[location_id][product_id] = 0
                if datas and datas[0]:
                    if not datas[0].get('sum', None):
                        stock_datas[location_id][product_id] = 0
                    else:
                        stock_datas[location_id][product_id] = datas[0].get('sum')
                    self.env.cr.execute("select id from product_product where id=%s" % product_id)
                    datas = self.env.cr.dictfetchall()
                    if len(datas) != 1 and product_id != 0:
                        productHasRemovedIds.append(product_id)
                        continue
                    product = self.env['product.product'].sudo().browse(product_id)
                    hasBoms = self.env['mrp.bom'].sudo().search([
                        '|',
                        ('product_id', '=', product_id),
                        ('product_tmpl_id', '=', product.product_tmpl_id.id),
                    ])
                    if hasBoms:
                        product.with_context(location=location_id)
                        qty_available = product.qty_available
                        stock_datas[location_id][product_id] = qty_available
        if len(productHasRemovedIds) > 0:
            self.env['pos.cache.database'].syncToPosOnline('product.product', productHasRemovedIds)
        return stock_datas
