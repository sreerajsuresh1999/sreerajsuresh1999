# -*- coding: utf-8 -*-
from odoo import fields, models, api, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class remove_pos_order(models.TransientModel):
    _name = "remove.pos.order"
    _description = "Remove pos order"

    pos_security_pin = fields.Char("Pos security pin")

    def remove_pos_orders(self):
        _logger.info('BEGIN remove_pos_orders')
        user = self.env.user
        order_obj = self.env['pos.order']
        orders = self.env['pos.order'].browse(self.env.context.get('active_ids', []))
        if not user.pos_delete_order:
            raise UserError(_('Warning!\n'
                              'You are not allowed to perform this operation ! \n'
                              'If you need to do it, please contact your admin, go to Setting/User active it'))
        if user.pos_security_pin != int(self.pos_security_pin):
            raise UserError(_('Warning!\n'
                              'Please Enter correct PIN!'))
        if not orders:
            raise UserError(_('Warning!\n'
                              'Please select order!'))
        order_ids = [order.id for order in orders]
        self.env.cr.execute(''' select id from account_bank_statement_line
                    WHERE pos_statement_id in %s''' % (
                " (%s) " % ','.join(map(str, order_ids))))
        result = self.env.cr.dictfetchall()
        if len(order_ids) == 1:
            order_ids.append(0)
        self.env.cr.execute("delete from pos_payment where pos_order_id in %s", (tuple(order_ids),) )
        self.env.cr.commit()
        for statement_line in result:
            statement_line = self.env['account.bank.statement.line'].browse([statement_line.get('id')])
            if statement_line.journal_entry_ids:
                move_lines = []
                move_ids = []
                for move_line in statement_line.journal_entry_ids:
                    move_lines.append(move_line.id)
                    move_ids.append(move_line.move_id.id)
                if move_lines:
                    del_rec_line = ''' delete from account_partial_reconcile
                                        WHERE credit_move_id in %s or debit_move_id in %s''' % (
                        " (%s) " % ','.join(map(str, move_lines)), " (%s) " % ','.join(map(str, move_lines)))
                    self.env.cr.execute(del_rec_line)
                if move_ids:
                    del_move = ''' delete from account_move
                                        WHERE id in %s''' % (
                            " (%s) " % ','.join(map(str, move_ids)))
                    self.env.cr.execute(del_move)
                    self.env.cr.commit()
        once = False
        total_amount = sum(
            order_obj.browse(order_ids).filtered(lambda x: x.state == 'done').mapped(
                'amount_total'))
        orders = order_obj.browse(order_ids)
        session_ids = list(set([order.session_id for order in orders]))
        picking_ids = []
        for order in orders:
            for p in order.picking_ids:
                picking_ids.append(p.id)
        statements = list(
            set([statement_id for session_id in session_ids for statement_id in session_id.statement_ids]))
        del_rec_line = ''' delete from pos_order
                                WHERE id in %s''' % (" (%s) " % ','.join(map(str, order_ids)))
        self.env.cr.execute(del_rec_line)
        if picking_ids:
            del_pack_line = ''' delete from stock_move_line
                                    WHERE picking_id in %s''' % (" (%s) " % ','.join(map(str, picking_ids)))
            self.env.cr.execute(del_pack_line)
            del_move_line = ''' delete from stock_move
                                    WHERE picking_id in %s''' % (" (%s) " % ','.join(map(str, picking_ids)))
            self.env.cr.execute(del_move_line)
            del_picking_line = ''' delete from stock_picking
                                    WHERE id in %s''' % (" (%s) " % ','.join(map(str, picking_ids)))
            self.env.cr.execute(del_picking_line)
        for each_stat in statements:
            each_stat._end_balance()
            if each_stat.state == 'confirm':
                each_stat.write({'balance_end_real': each_stat.balance_end_real - total_amount})
        return True
