# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class account_journal(models.Model):
    _inherit = "account.journal"

    pos_method_type = fields.Selection([
        ('default', 'Default'),
        ('rounding', 'Rounding'),
        ('wallet', 'Wallet'),
        ('voucher', 'Voucher'),
        ('credit', 'Credit/Debt'),
        ('return', 'Return Order')
    ], default='default', string='POS Method', required=1)
    decimal_rounding = fields.Integer(
        'POS Decimal Rounding',
        default=1,
        help='Example: \n'
             'Amount Paid is 1.94, set rounding 1, Amount Paid become 1.9 \n'
             'Amount Paid is 1.94, set rounding 0, Amount Paid become 2')
