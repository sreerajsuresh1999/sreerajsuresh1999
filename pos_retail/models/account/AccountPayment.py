# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
import logging

_logger = logging.getLogger(__name__)

class AccountPayment(models.Model):

    _inherit = "account.payment"

    origin = fields.Char('Source Origin', readonly=1)
    pos_branch_id = fields.Many2one('pos.branch', string='Branch', readonly=1)
    pos_session_id = fields.Many2one('pos.session', string='POS Session', readonly=1)

    @api.model
    def create(self, vals):
        context = self._context.copy()
        if context.get('pos_session_id', None):
            vals.update({
                'pos_session_id': context.get('pos_session_id'),
                'origin': 'Point Of Sale'
            })
            session = self.env['pos.session'].sudo().browse(context.get('pos_session_id'))
            if session and session.config_id and session.config_id.pos_branch_id:
                vals.update({
                    'pos_branch_id': session.config_id.pos_branch_id.id
                })
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        payment = super(AccountPayment, self).create(vals)
        return payment
