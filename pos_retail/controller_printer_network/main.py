# -*- coding: utf-8 -*-
import logging
from odoo import http

from . import hw_escpos as hwEscpos

try:
    from .. escpos import escpos as Escpos, exceptions as E, printer as Printer
except ImportError:
    Escpos = Printer = None

import platform    # For getting the operating system name
import subprocess  # For executing a shell command
import time

LOGGER = logging.getLogger(__name__)
LOGGER.info('importing Printer')
LOGGER.info(Printer)

class Network(Printer.Network):
    """ override to add python3 compatibility"""
    def _raw(self, msg):
        if type(msg) is str:
            msg = msg.encode("utf-8")
        if isinstance(msg, str):
            msg = msg.encode()  #str to bytes
        self.device.sendall(msg)


class EscposDriver(hwEscpos.EscposDriver):
    def __init__(self, ip, port):
        """ IP address and port required to connect to printer """
        hwEscpos.EscposDriver.__init__(self)
        self.ip = ip
        self.port = int(port)
        LOGGER.info('[__init__] EscposDriver with ip %s and port %s' % (ip, port))

    def connected_network_devices(self):
        """ define the printer to connect to """
        connected = {'ip': self.ip, 'port': self.port}
        return connected

    def get_escpos_printer(self):
        printers = None
        if self.ip and self.port:
            printers = self.connected_network_devices()
            if printers:
                print_dev = Network(printers['ip'], printers['port'])
                peer = print_dev.device.getpeername()
                self.set_status(
                    'connected', 'Connected to IP printer: %s on port %s' %
                    (peer[0], peer[1]))
                return print_dev
        else:
            printers = self.connected_usb_devices()
            if printers:
                print_dev = Printer.Usb(printers[0]['vendor'],
                                        printers[0]['product'])
                self.set_status(
                    'connected', "Connected to %s (in=0x%02x,out=0x%02x)" %
                    (printers[0]['name'], print_dev.in_ep, print_dev.out_ep))
                return print_dev
        self.set_status('disconnected', 'Printer Not Found')
        return None

    def run(self):
        """ overrides to add python 3 compatibility """
        printer = None
        if not Escpos:
            LOGGER.error(
                'ESC/POS cannot initialize, please verify system dependencies.'
            )
            return
        while True:
            try:
                error = True
                timestamp, task, data = self.queue.get(True)

                printer = self.get_escpos_printer()

                if printer == None:
                    if task != 'status':
                        self.queue.put((timestamp, task, data))
                    error = False
                    time.sleep(5)
                    continue
                elif task == 'receipt':
                    if timestamp >= time.time() - 1 * 60 * 60:
                        self.print_receipt_body(printer, data)
                        printer.cut()
                elif task == 'xml_receipt':
                    if timestamp >= time.time() - 1 * 60 * 60:
                        printer.receipt(data)
                elif task == 'cashbox':
                    if timestamp >= time.time() - 12:
                        self.open_cashbox(printer)
                elif task == 'printstatus':
                    self.print_status(printer)
                elif task == 'status':
                    pass
                error = False

            except E.NoDeviceError as e:
                print("No device found %s" % e)
            except E.HandleDeviceError as e:
                print(
                    "Impossible to handle the device due to previous error %s"
                    % e)
            except E.TicketNotPrinted as e:
                print(
                    "The ticket does not seems to have been fully printed %s" %
                    e)
            except E.NoStatusError as e:
                print("Impossible to get the status of the printer %s" % e)
            except Exception as e:
                self.set_status('error', e)
                LOGGER.exception()
            finally:
                self.ip = None
                self.port = None
                if error:
                    self.queue.put((timestamp, task, data))
                if printer:
                    printer.device.close()

    def set_status(self, status, message=None):
        if not isinstance(message, str):  #python3 compatibility
            message = '%s' % message
        LOGGER.info(status + ' : ' + (message or 'no message'))
        if status == self.status['status']:
            if message != None and (len(self.status['messages']) == 0
                                    or message != self.status['messages'][-1]):
                self.status['messages'].append(message)
        else:
            self.status['status'] = status
            if message:
                self.status['messages'] = [message]
            else:
                self.status['messages'] = []

        if status == 'error' and message:
            LOGGER.error('ESC/POS Error: %s', message)
        elif status == 'disconnected' and message:
            LOGGER.warning('ESC/POS Device Disconnected: %s', message)


class EscposProxy(hwEscpos.EscposProxy):
    @http.route('/printer_network/print_xml_receipt',
                type='json',
                auth='none',
                cors='*')
    def print_xml_receipt(self, **params):
        LOGGER.info('ESC/POS: PRINT XML RECEIPT USING NETWORK PRINTER')
        try:
            ip = params.get('ip') or '127.0.0.1'
            port = params.get('port') or 9100
            driver = EscposDriver(ip, port)
            driver.push_task('xml_receipt', params.get('receipt'))
        except Exception as e:
            return {'error': True, 'message': e}
        else:
            return {'error': False, 'message': ''}

    @http.route('/printer_network/get_status', type='json', auth='none', cors='*')
    def pingPrinter(self, printer_ip='127.0.0.1'):
        if printer_ip:
            LOGGER.info('ESCPOS: ping proxy %s' % printer_ip)
            param = '-n' if platform.system().lower() == 'windows' else '-c'
            command = ['ping', param, '1', printer_ip]
            return subprocess.call(command) == 0
        else:
            return False