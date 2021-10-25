# -*- coding: utf-8 -*
import websocket
from websocket import create_connection
from odoo import http, _
from odoo.addons.web.controllers import main as web

import json
import logging

_logger = logging.getLogger(__name__)

try:
    from xmlrpc import client as xmlrpclib
except ImportError:
    import xmlrpclib

try:
    from queue import Queue
except ImportError:
    from Queue import Queue  # pylint: disable=deprecated-module
try:
    import thread
except ImportError:
    import _thread as thread
import time

def on_message(ws, message):
    print(message)

def on_error(ws, error):
    print(error)

def on_close(ws):
    print("### closed ###")

def on_open(ws):
    def run(*args):
        for i in range(3):
            time.sleep(1)
            ws.send("Hello %d" % i)
        time.sleep(1)
        ws.close()
        print("thread terminating...")
    thread.start_new_thread(run, ())


websocket.enableTrace(True)
ws = websocket.WebSocketApp("ws://echo.websocket.org/",
                          on_message = on_message,
                          on_error = on_error,
                          on_close = on_close)
ws.on_open = on_open
ws.run_forever()

class SyncController(web.Home):

    @http.route('/pos/register/sync', type="json", auth='none', cors='*')
    def register_sync(self, database, config_id, config_ids):
        _logger.info('[Sync Withh Config ID] %s', config_id)
        ws = create_connection("ws://echo.websocket.org/")
        result = ws.recv()
        _logger.info('[Websobket] Received message {}'.format(result))
        return json.dumps({'state': 'succeed', 'values': result})

    @http.route('/pos/save/sync', type="json", auth='none', cors='*')
    def save_sync(self, database, send_from_config_id, config_ids, message):
        _logger.info('[Websobket] save message {}'.format(message))
        ws = create_connection("ws://echo.websocket.org/")
        ws.send(message)
        return json.dumps({'state': 'succeed', 'values': {}})
