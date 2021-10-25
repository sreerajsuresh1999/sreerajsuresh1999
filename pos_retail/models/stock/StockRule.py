# -*- coding: utf-8 -*-
from odoo import models, fields, _, api

import logging

_logger = logging.getLogger(__name__)

class StockRule(models.Model):
    _inherit = "stock.rule"

    def _get_stock_move_values(self, product_id, product_qty, product_uom, location_id, name, origin, company_id, values):
        datas = super(StockRule, self)._get_stock_move_values(product_id, product_qty, product_uom, location_id, name, origin, company_id, values)
        if values.get('location_id', None):
            datas.update({'location_id': values['location_id']})
        return datas