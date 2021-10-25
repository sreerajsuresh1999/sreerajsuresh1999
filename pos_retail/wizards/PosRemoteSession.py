# -*- coding: utf-8 -*-
from odoo import fields, models, api, _
import json
from odoo.exceptions import UserError

import logging

_logger = logging.getLogger(__name__)


class pos_remote_session(models.TransientModel):
    _name = "pos.remote.session"
    _description = "Help manage remote sessions"

    message = fields.Text('Message')
    config_ids = fields.Many2many(
        'pos.config',
        'remote_session_config_rel',
        'wiz_id',
        'config_id',
        'POS config need to do',
        required=1)
    action = fields.Selection([
        ('reload_session', 'Reload Session'),
        ('open_session', 'Open Session'),
        ('validate_and_post_entries', 'Validate and Post Entries'),
        ('close_session', 'Close Session'),
        # ('lock_session', 'Lock Session'),
        # ('unlock_session', 'UnLock Session'),
        ('remove_cache', 'Remove Cache')
    ],
        string='Action To Do',
        required=1,
        default='close_session'
    )

    def send_notifications(self):
        for record in self:
            if not record.config_ids:
                raise UserError(_('Warning, please add pos config the first'))
            vals = {}
            for config in record.config_ids:
                action = record.action
                if action == 'close_session':
                    action = 'force_close_session'
                vals[action] = True
                sessions = self.env['pos.session'].search([('config_id', '=', config.id), ('state', '=', 'opened')])
                if sessions:
                    vals.update({'session_id': sessions[0].id})
                    vals.update({'config_id': config.id})
                    vals.update({'database': self.env.cr.dbname})
                    user = sessions[0].user_id
                    self.env['bus.bus'].sendmany(
                        [[(self.env.cr.dbname, 'pos.remote_sessions', user.id), json.dumps(vals)]])
                else:
                    users = self.env['res.users'].search([('pos_config_id', '=', config.id)])
                    for user in users:
                        self.env['bus.bus'].sendmany(
                            [[(self.env.cr.dbname, 'pos.remote_sessions', user.id), json.dumps(vals)]])
        return True

    def closing_another_sessions_opened(self, config_id, message, start_time):
        # todo: when 1 pos session open at anywhere, we closing all session opened before
        vals = {}
        sessions = self.env['pos.session'].search([('config_id', '=', config_id), ('state', '=', 'opened')])
        vals['close_session'] = True
        vals['start_time'] = start_time
        for session in sessions:
            vals.update({'message': message})
            vals.update({'session_id': session.id})
            vals.update({'config_id': config_id})
            vals.update({'database': self.env.cr.dbname})
            user = sessions[0].user_id
            self.env['bus.bus'].sendmany(
                [[(self.env.cr.dbname, 'pos.remote_sessions', user.id), json.dumps(vals)]])
        return True
