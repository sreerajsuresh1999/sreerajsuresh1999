# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

class AccountInvoiceReport(models.Model):
    _inherit = "account.invoice.report"

    pos_branch_id = fields.Many2one('pos.branch')

    def _select(self):
        return super(AccountInvoiceReport, self)._select() + ", line.pos_branch_id as pos_branch_id"