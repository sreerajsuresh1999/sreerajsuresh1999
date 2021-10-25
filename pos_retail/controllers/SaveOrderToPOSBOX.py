# -*- coding: utf-8 -*
from threading import Thread
from odoo import http, _

try:
    from xmlrpc import client as xmlrpclib
except ImportError:
    import xmlrpclib

try:
    from queue import Queue
except ImportError:
    from Queue import Queue

from odoo.addons.web.controllers import main as web

import time
import json
import requests
import logging
import platform    # For getting the operating system name
import subprocess  # For executing a shell command

_logger = logging.getLogger(__name__)

TIMEOUT = 30

class SaveOrdersDrive(Thread):

    def __init__(self):
        self.sync_datas = {}
        self.cachesByModel = {}

    def register_point(self, database):
        if not self.sync_datas.get(database, None):
            self.sync_datas[database] = Queue()
        return True

    def save_orders_to_queue(self, database, orders, url, username, server_version):
        database_datas = self.sync_datas.get(database)
        if not database_datas:
            self.register_point(database)
        for order in orders:
            _logger.info('pos.retail saved POS Order Ref: %s' % order['id'])
            order.update({
                'url': url,
                'username': username,
                'server_version': server_version
            })
            self.sync_datas[database].put((time.time(), order['id'], order))
        return True

    def get_orders(self):
        results = {}
        for database, value in self.sync_datas.items():
            if not self.sync_datas.get(database, None):
                self.register_point(database)
                continue
            else:
                while not self.sync_datas[database].empty():
                    if not results.get(database, None):
                        results[database] = [self.sync_datas[database].get()]
                    else:
                        results[database].append(self.sync_datas[database].get())
        return results

driver = SaveOrdersDrive()

class SaveOrderController(web.Home):

    @http.route('/pos/save/orders', type="json", auth='none', cors='*')
    def save_orders(self, database, orders, url, username, server_version):
        driver.save_orders_to_queue(database, orders, url, username, server_version)
        order_ids = [order['id'] for order in orders]
        return json.dumps({'state': 'succeed', 'order_ids': order_ids})

    @http.route('/pos/push/orders', type="json", auth='none', cors='*')
    def push_orders(self, database):
        _logger.info('push orders to server Odoo')
        results = driver.get_orders()
        headers = {'Content-type': 'application/json', 'Accept': 'text/plain'}
        for database, orders in results.items():
            order = orders[0][2]
            url = order['url']
            username = order['username']
            server_version = order['server_version']
            _logger.info('request server url %s with user %s and total order %s' % (url, username, len(orders)))
            try:
                res = requests.post(url, data=json.dumps({
                    'orders': orders,
                    'database': database,
                    'username': username,
                    'server_version': server_version,
                }), headers=headers, timeout=60000)
                response = res.json()
                _logger.info(response)
                if response.get('error', None):
                    orders = [order[2] for order in orders]
                    driver.save_orders_to_queue(database, orders, url, username, server_version)
            except:
                orders = [order[2] for order in orders]
                driver.save_orders_to_queue(database, orders, url, username, server_version)
        return json.dumps({'state': 'succeed', 'values': {}})

    @http.route('/pos/ping/server', type="json", auth='none', cors='*')
    def ping_odoo_server(self, ip, port):
        _logger.info('ping server ip address %s' % ip)
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        command = ['ping', param, '1', ip]
        return json.dumps({'state': 'succeed', 'values': subprocess.call(command) == 0})

    @http.route('/iot/get/datas', type="json", auth='none', cors='*')
    def iotGetDatas(self, server_info={}):
        _logger.info('[BEGIN] push orders to server Odoo')
        headers = {'Content-type': 'application/json', 'Accept': 'text/plain'}
        try:
            res = requests.post(server_info['url'], data=json.dumps({
                'model': server_info['model'],
                'domain': server_info['domain'],
                'context': server_info['context'],
            }), headers=headers, timeout=60000)
            response = res.json()
            _logger.info(response)
            if response.get('error', None):
                _logger.info(response)
        except:
            _logger.info('Error')
        return json.dumps({'state': 'succeed', 'values': {}})
