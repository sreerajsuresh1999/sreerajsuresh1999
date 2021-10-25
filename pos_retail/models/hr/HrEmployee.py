# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import logging

_logger = logging.getLogger(__name__)


class PosBranch(models.Model):
    _inherit = "hr.employee"

    allow_discount = fields.Boolean('Allow Change Discount', default=1)
    allow_qty = fields.Boolean('Allow Change Quantity', default=1)
    allow_price = fields.Boolean('Allow Change Price', default=1)
    allow_remove_line = fields.Boolean('Allow Remove Line', default=1)
    allow_minus = fields.Boolean('Allow Minus (+/-)', default=1)
    allow_payment = fields.Boolean('Allow Payment', default=1)
    allow_customer = fields.Boolean('Allow set Customer', default=1)
    allow_add_order = fields.Boolean('Allow Add Order', default=1)
    allow_remove_order = fields.Boolean('Allow Remove Order', default=1)
    allow_add_product = fields.Boolean('Allow Add Product', default=1)
    allow_payment_zero = fields.Boolean(
        'Allow Payment Zero',
        default=1,
        help='If active, cashier can made order total amount smaller than or equal 0')
    allow_offline_mode = fields.Boolean(
        'Allow Offline Mode',
        default=1,
        help='Required Internet of Cashiers Counter Devlice used POS Session online \n'
             'If have problem internet of Cashier Counter, POS not allow submit Orders to Backend \n'
             'Example Case Problem: \n'
             '1) Intenet Offline , Cashiers submit orders to Odoo server and not success \n'
             '2) And then them clear cache browse , and orders save on Cache of Browse removed \n'
             '- It mean all orders will lost \n'
             'So this function active, when any Orders submit to backend, POS auto check Odoo server online or not. If online allow Validate Order'
    )
