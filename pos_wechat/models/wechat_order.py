# Copyright 2018 Ivan Yelizariev <https://it-projects.info/team/yelizariev>
# License MIT (https://opensource.org/licenses/MIT).
import json

from odoo import api, models


class WeChatOrder(models.Model):
    _inherit = ["wechat.order", "wechat.pos"]
    _name = "wechat.order"

    def _prepare_message(self):
        self.ensure_one()
        result_json = json.loads(self.result_raw)
        msg = {
            "event": "payment_result",
            "result_code": result_json["result_code"],
            "order_ref": self.order_ref,
            "total_fee": self.total_fee,
            "journal_id": self.journal_id.id,
        }
        return msg

    def on_notification(self, data):
        order = super(WeChatOrder, self).on_notification(data)
        if order and order.pos_id:
            order._send_pos_notification()
        return order

    @api.model
    def create_qr(self, lines, **kwargs):
        pos_id = kwargs.get("pos_id")
        if pos_id:
            if "create_vals" not in kwargs:
                kwargs["create_vals"] = {}
            kwargs["create_vals"]["pos_id"] = pos_id
        return super(WeChatOrder, self.sudo()).create_qr(lines, **kwargs)
