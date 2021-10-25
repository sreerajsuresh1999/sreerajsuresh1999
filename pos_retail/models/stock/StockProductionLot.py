# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from datetime import datetime

import logging
_logger = logging.getLogger(__name__)


class stock_production_lot(models.Model):
    _inherit = 'stock.production.lot'

    barcode = fields.Char('Barcode')
    replace_product_public_price = fields.Boolean('Replace public price of product')
    public_price = fields.Float('Sale price')

    @api.model
    def create(self, vals):
        lot = super(stock_production_lot, self).create(vals)
        if not lot.barcode:
            format_code = "%s%s%s" % ('888', lot.id, datetime.now().strftime("%d%m%y%H%M"))
            code = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            lot.write({'barcode': code})
        return lot

    def update_ean(self):
        for lot in self:
            format_code = "%s%s%s" % ('888', lot.id, datetime.now().strftime("%d%m%y%H%M"))
            code = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            lot.write({'barcode': code})
        return True

    def pos_create_lots(self, lots, fields_read, pos_config_name, location_id):
        values = []
        for lot_val in lots:
            lot = self.sudo().create({
                'name': lot_val.get('name'),
                'product_id': lot_val.get('product_id'),
                'company_id': lot_val.get('company_id')
            })
            if lot_val.get('quantity') > 0:
                self.env['stock.quant'].sudo().create({
                    'product_id': lot_val.get('product_id'),
                    'location_id': lot_val.get('location_id'),
                    'lot_id': lot.id,
                    'quantity': lot_val.get('quantity'),
                    'in_date': fields.Datetime.now()
                })
            values.append(lot.read(fields_read)[0])
        return values
