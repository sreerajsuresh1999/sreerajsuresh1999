from odoo import models, fields


class MetrcMessageWizard(models.TransientModel):
    _name = 'metrc.message.wizard'

    message = fields.Text('Message', required=True)

    def action_close(self):
        return {'type': 'ir.actions.act_window_close'}

    def popup_message(self, head, message):
        message_id = self.env['metrc.message.wizard'].sudo().create({'message': message})
        return {
            'name': head,
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_model': 'metrc.message.wizard',
            'res_id': message_id.id,
            'target': 'new'
        }
