# -*- coding: utf-8 -*-
from odoo import fields, api, models

import logging
import json

_logger = logging.getLogger(__name__)


class StockQuant(models.Model):
    _inherit = "stock.quant"

    # def send_notification_pos(self, product_ids):
    #     sessions = self.env['pos.session'].sudo().search([
    #         ('state', '=', 'opened'),
    #         ('config_id.display_onhand', '=', True)
    #     ])
    #     for session in sessions:
    #         self.env['bus.bus'].sendmany(
    #             [[(self.env.cr.dbname, 'pos.sync.stock', session.user_id.id), json.dumps({
    #                 'product_ids': product_ids,
    #             })]])
    #     return True

    @api.model
    def create(self, vals):
        quant = super(StockQuant, self).create(vals)
        # self.send_notification_pos([quant.product_id.id])
        return quant
    #
    # def write(self, vals):
    #     """
    #     TODO: WHY HAVE THIS SOLUTION
    #     - If we have 100 200 shop, orders peer day is 100k, 200k
    #     - So stock quant update it a crazy
    #     - We define
    #     -                  1 stock quant - 1 update on 1 time, not allow many transactions update stock quant the same quant id
    #     -                  we push all stock quant update to table stock quant queue
    #     -                  when pos sessions calling method get_stock_data_by_location_ids, we will reupdate stock quant
    #     """
    #     context = self._context.copy()
    #     if context.get('pos_coming', None) and vals.get('quantity', None):
    #         for quant in self:
    #             self.env['stock.quant.queue'].create({
    #                 'quant_id': quant.id,
    #                 'datas': json.dumps(vals),
    #                 'product_id': quant.product_id.id if quant.product_id else None
    #             })
    #         return True
    #     else:
    #         return super(StockQuant, self).write(vals)


class StockQuantQueue(models.Model):
    _name = "stock.quant.queue"
    _description = "Anything update stock quant we push in this table. And schedule odoo automnatic running after 1 minutes"
    _rec_name = 'product_id'

    product_id = fields.Many2one('product.product', 'Product Variant', readonly=1, ondelete='set null')
    quant_id = fields.Integer('Quant ID', readonly=1)
    datas = fields.Text('Datas', readonly=1)

    def autoUpdateStock(self):
        """
        Only one transaction update stock quant
        --------------------------------------------------
        Example: first Product have total quantity is 100
            - time 1: User A update quantity of quant to 90 (sold out 10) => original update quantity become to 100 - 10 = 90
            - time 2: User B update quantity of quant to 75 (sold out 15) => original update quantity become to 90 - 15 = 75
            - time 3: User C update quantity of quant to 45 (sold out 20) => original update quantity become to 75 - 20 = 55
            => end of 3 transactions we have 45 qty in stock
            => so we have 3 transactions update stock quant
        Solution: made all update stock quant to 1 transaction
            - time 1: add to queue with quantity 90
            - time 2: add to queue with quantity 95
            - time 3: add to queue with quantity 80
            => action update quant will compute like bellow
            - 1st quantity of quant is 100
            - time 1: 100 - 90 = 10
            - time 2: 100 - 85 = 15
            - time 3: 100 - 80 = 20
            => total sould out = 10 + 15 + 20 => 45
            => end of all transaction in queues we have end quantity of QUANT is: 100 - 45 = 55
            => only one update stock_quant set quantity with 55
        """
        sql1 = """
        SELECT
            quant_id, create_date
        FROM
            (
              -- For every product_id, find maximum create_date time
              SELECT
                  quant_id, max(create_date) AS create_date
              FROM
                  stock_quant_queue
              GROUP BY
                  quant_id
             ) AS mx
        ORDER BY
             quant_id ;
        """
        self.env.cr.execute(sql1)
        queues = self.env.cr.dictfetchall()
        for queue in queues:
            quant = self.env['stock.quant'].sudo().browse(queue.get('quant_id'))
            try:
                firstQuantity = quant.quantity
                totalOut = 0
                inDate = None
                queuesTheSameQuantId = self.sudo().search([('quant_id', '=', quant.id)], order='create_date')
                for q in queuesTheSameQuantId:
                    datas = json.loads(q.datas)
                    if datas.get('quantity', None) and datas.get('in_date', None):
                        totalOut += firstQuantity - datas['quantity']
                        inDate = datas['in_date']
                if totalOut > 0:
                    endQuantity = firstQuantity - totalOut
                    quant.sudo().write({
                        'quantity': endQuantity,
                        'in_date': inDate
                    })
                    _logger.info('%s Redeem Stock on hand to %s', quant.product_id.display_name, endQuantity)
                else:
                    _logger.info('%s of quant ID %s no change', quant.product_id.display_name, quant.id)
            except Exception as ex:
                _logger.info(ex)
        self.search([]).unlink()
        return True
