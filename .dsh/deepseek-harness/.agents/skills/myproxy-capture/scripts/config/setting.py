import json
import codecs
import os
from configparser import ConfigParser

database_server_name=None
def load_config():
    global database_server_name

    # config_file_name=os.path.dirname(os.path.dirname(os.path.abspath(__file__))) +'/system.conf'
    config_file_name='system.conf'
    system_config = ConfigParser()
    system_config.read(config_file_name, encoding='UTF-8')

    #database_server_name=system_config.get('database', 'server_name')
    return system_config


