# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _, registry
from odoo.exceptions import UserError
from odoo import SUPERUSER_ID
from passlib.context import CryptContext
from datetime import datetime
from odoo.tools import DEFAULT_SERVER_DATE_FORMAT

crypt_context = CryptContext(schemes=['pbkdf2_sha512', 'plaintext'], deprecated=['plaintext'])

import logging

_logger = logging.getLogger(__name__)


# TODO: workflow of pos session and account bank statement odoo 13
#       - pos session create, session will reading all payment_method_ids (payment methods) (1)
#       - from (1) they create statement_ids (account bank statement) and add it to pos session (2)
#       - from (2) when close session , they push to account brank statement with relation 1 to 1 (one-to-one). 1 account bank statement - 1 account bank statement line
#       - summary: 1 payment method - 1 account journal - 1 account bank statement - 1 account bank statement line

class PosSession(models.Model):
    _inherit = "pos.session"

    required_reinstall_cache = fields.Boolean(
        'Reinstall Datas',
        default=0,
        help='If checked, when session start, all pos caches will remove and reinstall')
    backup_session = fields.Boolean('Backup Session')
    pos_branch_id = fields.Many2one('pos.branch', string='Branch', readonly=1)
    employee_id = fields.Many2one('hr.employee', string='Assigned Employee')
    lock_state = fields.Selection([
        ('unlock', 'Un lock'),
        ('locked', 'Locked')
    ], default='unlock',
        string='Lock state',
        help='Unlock: when pos session start, pos not lock screen\n'
             'locked: when pos session start, pos auto lock screen')

    order_log_ids = fields.One2many(
        'pos.order.log',
        'session_id',
        string='Log Actions of Orders'
    )
    opened_at = fields.Datetime('Opened At', readonly=1)
    opened_uid = fields.Many2one('res.users', 'Opened by', readonly=1)
    last_login_time = fields.Datetime('Last Login Date', tracking=3, readonly=1)
    login_number = fields.Integer(tracking=3, readonly=1)
    state = fields.Selection(tracking=3)

    def set_cashbox_pos(self, cashbox_value, notes):
        res = super(PosSession, self).set_cashbox_pos(cashbox_value, notes)
        _logger.info('[set_cashbox_pos] with cashbox_value %s and notes %s' % (cashbox_value, notes))
        return res

    @api.constrains('config_id')
    def _check_pos_config(self):  # todo: we need open multi session base on 1 POS CONFIG
        config = self.config_id
        if config.multi_session:
            return True
        else:
            return super(PosSession, self)._check_pos_config()

    def get_session_by_employee_id(self, employee_id, pos_config_id):
        _logger.info(
            '[Begin] get_session_by_employee_id for employee_id %s and pos_config_id %s' % (employee_id, pos_config_id))
        employee = self.env['hr.employee'].browse(employee_id)
        session_opened = self.search([
            ('employee_id', '=', None),
            ('config_id', '=', pos_config_id),
            ('state', '=', 'opened'),
        ], limit=1)
        if session_opened:
            session_opened.write({'employee_id': employee_id})
            return {
                'session': session_opened.search_read([('id', '=', session_opened.id)], [])[0],
                'login_number': session_opened.login(),
                'state': 'blank',
            }
        session = self.search([
            ('employee_id', '=', employee_id),
            ('config_id', '=', pos_config_id),
            ('state', '!=', 'closed'),
        ], limit=1)
        if session:
            return {
                'session': session.search_read([('id', '=', session.id)], [])[0],
                'login_number': session.login(),
                'state': 'opened',
            }
        else:
            session = self.env['pos.session'].sudo().create({
                'user_id': self.env.user.id,
                'config_id': pos_config_id,
                'employee_id': employee_id,
            })
            session.write({'name': session.name + '( %s )' % employee.name})
            return {
                'session': session.search_read([('id', '=', session.id)], [])[0],
                'login_number': session.login(),
                'state': 'new',
            }

    # removed at 01.01.2020 and change to force_action_pos_session_close
    # def close_session_and_validate(self):
    #     _logger.info('[Begin] Closing Session direct from POS Screen')
    #     for session in self:
    #         _logger.info('starting closing session %s', session.id)
    #         session.action_pos_session_closing_control()
    #         if session.config_id.cash_control and session.state == 'closing_control':
    #             session.action_pos_session_validate()
    #     return True

    def register_license(self, license):
        if license:
            isValid = crypt_context.verify_and_update(self.env.cr.dbname, license)[0]
            if isValid:
                self.env['ir.config_parameter'].sudo().set_param('license', license)
        else:
            return False
        return isValid

    def force_action_pos_session_close(self):
        for session in self:
            session._validate_session()
            _logger.info('[force_action_pos_session_close] closed session: %s' % session.name)
        return True

    def action_pos_session_closing_control(self):
        for session in self:
            if not session.config_id.allow_closing_session and not self.env.user.has_group(
                    'point_of_sale.group_pos_manager'):
                raise UserError(_('You have not permission closing session \n'
                                  'Please request Manager or admin \n'
                                  '1. Go to POS Setting / Security tab and check to field Allow Closing Session \n'
                                  '2. Or you are become Point of Sale Admin'))
            orders = self.env['pos.order'].search([
                ('state', '=', 'draft'),
                ('session_id', '=', session.id),
            ])
            _logger.info('orders not full fill payment: %s' % orders)
            for order in orders:
                if order._is_pos_order_paid():
                    order.action_pos_order_paid()
                    self.env.cr.commit()
                else:
                    order.write({'state': 'quotation'})
            self.env['pos.backup.orders'].search([
                ('config_id', '=', session.config_id.id)
            ]).unlink()
        res = super(PosSession, self).action_pos_session_closing_control()
        return res

    def _get_backup_session(self, order):
        # todo 1: we create new pos session or get pos session rescue, and add pos_session_id of draft order to this session
        # todo 2: for current session can close and rescue session use next session
        closed_session = order.session_id
        rescue_session = self.search([
            ('state', 'not in', ('closed', 'closing_control')),
            ('rescue', '=', True),
            ('config_id', '=', closed_session.config_id.id),
        ], limit=1)
        if rescue_session:
            return rescue_session.id
        new_session = self.create({
            'config_id': closed_session.config_id.id,
            'name': _('(SESSION BACKUP FOR %(session)s, save Orders not full full payments)') % {'session': closed_session.name},
            'rescue': True,
            'backup_session': True,
        })
        new_session.action_pos_session_open()
        return new_session.id

    def getExpiredDays(self):
        license_started_date = self.env['ir.config_parameter'].sudo().get_param('license_started_date')
        license = self.env['ir.config_parameter'].sudo().get_param('license')
        isValid = False
        if not license_started_date:
            return {
                'Code': 403,
                'usedDays': 0,
                'isValid': isValid
            }
        else:
            started_date = datetime.strptime(license_started_date, DEFAULT_SERVER_DATE_FORMAT)
            today = datetime.today()
            usedDays = (today - started_date).days
            if license:
                isValid = crypt_context.verify_and_update(self.env.cr.dbname, license)[0]
            if started_date > today:
                return {
                    'Code': 200,
                    'isValid': False,
                    'usedDays': 31
                }
            else:
                return {
                    'Code': 200,
                    'isValid': isValid,
                    'usedDays': usedDays
                }

    def _check_if_no_draft_orders(self):
        orders_not_done = self.order_ids.filtered(
            lambda order: order.state not in ['cancel', 'paid', 'done', 'invoiced'])
        if len(orders_not_done) >= 1:
            for session in self:
                if session.rescue:
                    raise UserError(_('It not possible close session backup if have orders not full fill payment, \n '
                                      'Please register payment or cancel orders with reference in list:  %s ' % [
                                          order.pos_reference for order in orders_not_done]))
            _logger.warning('Total orders_not_done is %s' % len(orders_not_done))
            # TODO: normally when pos closing session, if have any orders draft, Odoo Original not allow closing Session
            # So, system can not drop orders draft. and need keep orders existing system like a Quotation Order
            # So, we create new session like Rescue Session and save all Orders draft/quotation state to it
            for order in orders_not_done:
                rescue_session_id = self._get_backup_session(order)
                order.write({'session_id': rescue_session_id})
                self.env.cr.commit()
        return super(PosSession, self)._check_if_no_draft_orders()

    def action_pos_session_validate(self):
        for session in self:
            orders = self.env['pos.order'].search([
                ('state', '=', 'draft'),
                ('session_id', '=', session.id),
                ('picking_ids', '=', None)
            ])
            for order in orders:
                if order._is_pos_order_paid():
                    order.action_pos_order_paid()
                    self.env.cr.commit()
        return super(PosSession, self).action_pos_session_validate()

    def lock_session(self, vals):
        return self.sudo().write(vals)

    def login(self):
        res = super(PosSession, self).login()
        self.write({'last_login_time': fields.Datetime.now()})
        return res

    def action_open_move(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('account.action_move_out_invoice_type')
        action['context'] = {}
        if self.move_id:
            action['domain'] = [('id', '=', self.move_id.id)]
        else:
            action['domain'] = [('id', '=', None)]
        return action

    @api.model
    def create(self, vals):
        config = self.env['pos.config'].browse(vals.get('config_id'))
        if config.pos_branch_id:
            vals.update({'pos_branch_id': config.pos_branch_id.id})
        else:
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        if config.pos_branch_id and not self.env.user.pos_branch_id:
            raise UserError('This POS assigned to Branch %s \n'
                            'But your account not set Branh, \n'
                            'Please go to Settings / Users & Companies / User and config your User \n'
                            'Have the same Branch with this POS Setting')
        session = super(PosSession, self).create(vals)
        session.update_stock_at_closing = config.point_of_sale_update_stock_quantities == "closing"
        if session.state == 'opening_control' and session.config_id.cash_control and session.config_id.default_set_cash_open:
            session.set_cashbox_pos(session.config_id.default_set_cash_amount,
                                    session.config_id.default_set_cash_notes or 'Automatic')
        return session

    def write(self, vals):
        if vals.get('login_number', None):
            vals.update({
                'opened_at': fields.Datetime.now(),
                'opened_uid': self.env.user.id,
            })
        return super(PosSession, self).write(vals)

    def update_required_reinstall_cache(self):
        return self.write({'required_reinstall_cache': False})

    def get_pos_session(self, session_id):
        if session_id:
            session = self.browse(int(session_id))
        if session:
            if session.user_id.has_group('point_of_sale.group_pos_manager'):
                admin = 1
            else:
                admin = 0
            pos_session = {
                "id": session.id,
                "name": session.name,
                "user_id": [session.user_id.id,
                            session.user_id.name],
                "cash_control": session.cash_control,
                "state": session.state,
                "stop_at": session.stop_at,
                "config_id": [session.config_id.id,
                              session.config_id.display_name],
                "start_at": session.start_at,
                "currency_id": [session.currency_id.id,
                                session.currency_id.name],
                "cash_register_balance_end_real": (
                    session.cash_register_balance_end_real),
                "cash_register_total_entry_encoding": (
                    session.cash_register_total_entry_encoding),
                "cash_register_difference": (
                    session.cash_register_difference),
                "cash_register_balance_start": (
                    session.cash_register_balance_start),
                "cash_register_balance_end": (
                    session.cash_register_balance_end),
                "is_admin": (admin)
            }
            return pos_session
        else:
            return

    def get_cashbox(self, session_id, balance):
        session = self.browse(int(session_id))
        session.ensure_one()
        context = dict(session._context)
        balance_type = balance or 'end'
        context['bank_statement_id'] = session.cash_register_id.id
        context['balance'] = balance_type
        context['default_pos_id'] = session.config_id.id
        cashbox_id = None
        if balance_type == 'start':
            cashbox_id = session.cash_register_id.cashbox_start_id.id
        else:
            cashbox_id = session.cash_register_id.cashbox_end_id.id
        cashbox_line = []
        total = 0
        if cashbox_id:
            accountCashboxLine = self.env['account.cashbox.line'].sudo()
            cashbox = accountCashboxLine.search([
                ('cashbox_id', '=', cashbox_id)
            ])
            if cashbox:
                for line in cashbox:
                    subtotal = line.number * line.coin_value
                    total += subtotal
                    cashbox_line.append({
                        "id": line.id,
                        "number": line.number,
                        "coin_value": line.coin_value,
                    })
        return cashbox_line

    def _validate_session(self):
        context = self._context.copy()
        context.update({'pos_session_id': self.id})
        res = super(PosSession, self.with_context(context))._validate_session()
        if self.move_id and self.pos_branch_id:
            self.env.cr.execute("UPDATE account_move SET pos_branch_id=%s WHERE id=%s" % (
                self.pos_branch_id.id, self.move_id.id))
            self.env.cr.execute("UPDATE account_move_line SET pos_branch_id=%s WHERE move_id=%s" % (
                self.pos_branch_id.id, self.move_id.id))
        vals = {}
        if not self.start_at:
            vals['start_at'] = fields.Datetime.now()
        if not self.stop_at:
            vals['stop_at'] = fields.Datetime.now()
        if vals:
            self.write(vals)
        return res

    def get_session_online(self):
        sessions_opened = self.sudo().search([('state', '=', 'opened')])
        return len(sessions_opened)

    def check_expired_license(self):
        license_started_date = self.env['ir.config_parameter'].sudo().get_param('license_started_date')
        if not license_started_date:
            return 366
        else:
            started_date = datetime.strptime(license_started_date, DEFAULT_SERVER_DATE_FORMAT)
            today = datetime.today()
            delta = (today - started_date).days
            return delta


class AccountBankStmtCashWizard(models.Model):
    """
    Account Bank Statement popup that allows entering cash details.
    """
    _inherit = 'account.bank.statement.cashbox'
    _description = 'Account Bank Statement Cashbox Details'

    description = fields.Char("Description")

    def validate_from_ui(self, session_id, balance, values):
        """
        Create , Edit , Delete of Closing Balance Grid
        param session_id: POS Open Session id .
        param values: Array records to save
        return: Array of cashbox line.
        """
        session = self.env['pos.session'].browse(int(session_id))
        bnk_stmt = session.cash_register_id
        if (balance == 'start'):
            self = session.cash_register_id.cashbox_start_id
        else:
            self = session.cash_register_id.cashbox_end_id
        if not self:
            self = self.create({'description': "Created from POS"})
            if self and (balance == 'end'):
                account_bank_statement = session.cash_register_id
                account_bank_statement.write({'cashbox_end_id': self.id})
        for val in values:
            id = val.get('id', None)
            number = val.get('number', 0)
            coin_value = val.get('coin_value', 0)
            cashbox_line = self.env['account.cashbox.line']
            if id and number and coin_value:  # Add new Row
                cashbox_line = cashbox_line.browse(id)
                cashbox_line.write({'number': number,
                                    'coin_value': coin_value
                                    })
            elif not id and number and coin_value:  # Add new Row
                cashbox_line.create({'number': number,
                                     'coin_value': coin_value,
                                     'cashbox_id': self.id
                                     })
            elif id and not (number and coin_value):  # Delete Exist Row
                cashbox_line = cashbox_line.browse(id)
                cashbox_line.unlink()

        total = 0.0
        for lines in self.cashbox_lines_ids:
            total += lines.subtotal
        if (balance == 'start'):  # starting balance
            bnk_stmt.write({
                'balance_start': total,
                'cashbox_start_id': self.id
            })
        else:  # closing balance
            bnk_stmt.write({
                'balance_end_real': total,
                'cashbox_end_id': self.id
            })
        if (balance == 'end'):
            if bnk_stmt.difference < 0:
                if self.env.user.id == SUPERUSER_ID:
                    return (_('you have to send more %s %s') %
                            (bnk_stmt.currency_id.symbol,
                             abs(bnk_stmt.difference)))
                else:
                    return (_('you have to send more amount'))
            elif bnk_stmt.difference > 0:
                if self.env.user.id == SUPERUSER_ID:
                    return (_('you may be missed some bills equal to %s %s')
                            % (bnk_stmt.currency_id.symbol,
                               abs(bnk_stmt.difference)))
                else:
                    return (_('you may be missed some bills'))
            else:
                return (_('you done a Great Job'))
        else:
            return

    def validate(self):
        """
        TODO: Raise popup for set closing balance in session POS
        """
        res = super(AccountBankStmtCashWizard, self).validate()
        bnk_stmt_id = (self.env.context.get('bank_statement_id', False) or
                       self.env.context.get('active_id', False))
        bnk_stmt = self.env['account.bank.statement'].browse(bnk_stmt_id)
        if bnk_stmt.pos_session_id.state == 'closing_control':
            if bnk_stmt.difference < 0:
                raise UserError(_('you have to send more %s %s') % (
                    bnk_stmt.currency_id.symbol,
                    abs(bnk_stmt.difference)))
            elif bnk_stmt.difference > 0:
                raise UserError(_('you may be missed some '
                                  'bills equal to %s %s') % (
                                    bnk_stmt.currency_id.symbol,
                                    abs(bnk_stmt.difference)))
            else:
                return res
        else:
            return res
