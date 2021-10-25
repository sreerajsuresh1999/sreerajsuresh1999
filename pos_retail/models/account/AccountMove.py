# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from datetime import datetime, timedelta
import logging

_logger = logging.getLogger(__name__)

class AccountMove(models.Model):

    _inherit = "account.move"

    add_credit = fields.Boolean(
        'Add Credit',
        help='If checked, Credit Note Amount total will plus to customer credit card'
    )
    origin = fields.Char('Source Origin')
    pos_branch_id = fields.Many2one('pos.branch', string='Branch', readonly=1)
    pos_session_id = fields.Many2one('pos.session', string='POS Session', readonly=1)

    @api.model
    def search_read(self, domain=None, fields=None, offset=0, limit=None, order=None):
        context = self._context.copy()
        if context.get('pos_config_id', None):
            config = self.env['pos.config'].browse(context.get('pos_config_id'))
            today = datetime.today()
            if config.load_invoices_type == 'load_all':
                domain = domain
            if config.load_invoices_type == 'last_3_days':
                loadFromDate = today + timedelta(days=-3)
                domain.append(('create_date', '>=', loadFromDate))
            if config.load_invoices_type == 'last_7_days':
                loadFromDate = today + timedelta(days=-7)
                domain.append(('create_date', '>=', loadFromDate))
            if config.load_invoices_type == 'last_1_month':
                loadFromDate = today + timedelta(days=-30)
                domain.append(('create_date', '>=', loadFromDate))
            if config.load_invoices_type == 'last_1_year':
                loadFromDate = today + timedelta(days=-365)
                domain.append(('create_date', '>=', loadFromDate))
        return super().search_read(domain=domain, fields=fields, offset=offset, limit=limit, order=order)

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
        if not vals.get('company_id', None):
            vals.update({'company_id': self.env.user.company_id.id})
        move = super(AccountMove, self).create(vals)
        if move.pos_session_id and move.pos_session_id.config_id.analytic_account_id and move.line_ids:
            move.line_ids.write({'analytic_account_id': move.pos_session_id.config_id.analytic_account_id.id})
        return move

    def write(self, vals):
        credit_object = self.env['res.partner.credit']
        for invoice in self:
            if invoice.add_credit and vals.get('state', None) == 'posted':
                credit_object.create({
                    'name': invoice.name,
                    'type': 'plus',
                    'amount': invoice.amount_total,
                    'move_id': invoice.id,
                    'partner_id': invoice.partner_id.id,
                })
            if vals.get('state', None) in ['draft', 'cancel']:
                credit_object.search([('move_id', '=', invoice.id)]).write({'active': False})
        res = super(AccountMove, self).write(vals)
        for move in self:
            if move.pos_session_id and move.pos_session_id.config_id.analytic_account_id and move.line_ids:
                move.line_ids.write({'analytic_account_id': move.pos_session_id.config_id.analytic_account_id.id})
        if vals.get('state', None) == 'posted':
            for move in self:
                _logger.info('[Move %s] posted' % move.id)
        return res

class AccountMoveLine(models.Model):
    _inherit = "account.move.line"

    pos_branch_id = fields.Many2one(
        'pos.branch',
        string='Branch',
        related='move_id.pos_branch_id',
        store=True,
        readonly=1
    )

    # TODO: why could not call create ??? If we remove comments here, pos session could not closing
    # TODO: dont reopen-comments codes
    # @api.model
    # def create(self, vals):
    #     if not vals.get('pos_branch_id'):
    #         vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
    #     move_line = super(AccountMoveLine, self).create(vals)
    #     return move_line
