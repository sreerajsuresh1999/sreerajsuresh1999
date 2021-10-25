# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import logging

_logger = logging.getLogger(__name__)


class RestaurantPrinter(models.Model):
    _inherit = "restaurant.printer"

    printer_type = fields.Selection(selection_add=[
        ('network', 'Printer Network Address')
    ], ondelete={
        'network': 'set default',
    })
    printer_id = fields.Many2one('pos.epson', 'Epson Printer Network Device')
    branch_id = fields.Many2one(
        'pos.branch',
        string='Branch',
        help='Only Branch Assigned can use this printer'
    )
