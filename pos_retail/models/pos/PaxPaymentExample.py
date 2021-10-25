import urllib.request
import base64

paxIP = '192.168.1.166'
paxPort = '10009'

posParameter = {
    'doCredit': {
        'command': 'T00',
        'versionNo': '1.28',
        'transactionIno': {
            'transactionType': '01'
            # Auth - 03
            # Sale - 01
            # Return - 02
            # Void - 16
            # PostAuth - 04
            # ForceAuth - 05
            # Adjust - 06
            # Verify - 24
        },
        'amountInfo': {
            'tranasctionAmount': '100',
            'tipAmount': '',
            'cashBack': '',
            'merchantFee': '',
            'tax': '',
            'fuelAmount': ''
        },
        'accountInfo':'',
        'traceInfo': {
            'refNo': '1',
            'invoiceNo':'',
            'authCode':'',
            'transscationNo':'',
            'timeStamp':'',
            'ecrTranID':''
        },
        'avsInfo': '',
        'cashInfo': {
            'clerkID':'',
            'shiftID':''
        },
        'commercialInfo': {
            'poNo':'',
            'customerCode':'',
            'taxExempt': '',
            'taxExemptID': '',
            'merchantTaxID': '',
            'destinationZipCode': '',
            'productDescription': ''
        },
        'motoEco': {
            'commerceMode':'',
            'transactionType': '',
            'secureType': '',
            'orderNo': '',
            'installments':'',
            'currentInstall': ''
        },
        'additionalInfo': ''
    },
    'doSignature': {
        'command': 'A20',
        'version': '1.28',
        'uploadInfo': {
            'uploadFlag': '0'
        },
        'hostInfo': {
            'hostReferenceNo': ''
        },
        'edcInfo': {
            'edcType': '3'
        },
        'timeoutInfo': {
            'timeout': '200'
        }
    },
    'getSignature': {
        'command': 'A08',
        'version': '1.28',
        'offsetInfo': {
            'offset': '0'
        },
        'requestLengthInfo':{
            'length': '90000'
        }
    },
    'initialize': {
        'command': 'A00',
        'version': '1.28'
    },
    'setvar': {
        'command': 'A04',
        'versionNo': '1.28',
        'edcType': '03',
        'varName1': 'UserName',
        'varValue1': '',
        'varName2': 'UserPassword',
        'varValue2': '!',
        'varName3': 'MID',
        'varValue3': '',
        'varName4': 'DeviceID',
        'varValue4': '',
        'varName5': '',
        'varValue5': ''
    }
}

class pax(object):
    def process(self, posParameter):
        self.posParameter = posParameter
        self.paxParam = []
        self.encodeValue(self.posParameter)
        self.response = self.callAPI(self.paxParam)
        self.parseReponse(self.response)

    def encodeValue(self, posParameter):
        print(posParameter)
        for info_index, info_group in enumerate(self.posParameter):
            self.paxParam.append(u'\u001c')
            if isinstance(self.posParameter[info_group], str):
                self.paxParam.append(self.posParameter[info_group])
                continue

            for value_index, value in enumerate(self.posParameter[info_group]):
                if value_index != 0:
                    self.paxParam.append(u'\u001f')
                self.paxParam.append(self.posParameter[info_group][value])
        self.paxParam[0] = u'\u0002'
        self.paxParam = bytearray("".join(self.paxParam),'utf-8')
        self.paxParam += bytes(self.getCheckCharacter(self.paxParam),'utf-8')
        self.paxParam = base64.b64encode(self.paxParam)
        print (self.paxParam)

    def getCheckCharacter(self, paxParam):
        checkCharacter = 0
        self.paxParam = iter(self.paxParam)
        next(self.paxParam)
        for x in self.paxParam:
            checkCharacter ^= x
        checkCharacter ^= 3

        checkCharacter = u'\u0003'+chr(checkCharacter)
        if checkCharacter == 0:
            checkCharacter = 0
        return checkCharacter

    def callAPI(self, param):
        self.param = param
        link = 'http://'+paxIP+':'+paxPort+'/?'+param.decode()
        print(link)
        try:
            htmlfile=urllib.request.urlopen(link, timeout=120)
        except:
            print('timeout error')
        else:
            return htmlfile.read()

    def parseReponse(self, response):
        response = repr(response).split('\\')
        print(response)
        # response = [e[3:] for e in response.split('\\')]
        # print(response)

pax().process(posParameter['doCredit'])



