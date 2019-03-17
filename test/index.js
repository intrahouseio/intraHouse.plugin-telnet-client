const child = require('child_process');
const modulepath = './index.js';

const unitid = 'telnet'

const params = {
  debug: 'on',
  loglevel: 1,
}

const system = {

}

const config2 = [
  {
    id: '1',
    host: "192.168.1.1",
    port: 23,
    username: 'admin',
    password: '230490fF',
    command: '/ip dhcp-server lease print ',
    interval: 5,
  },
  {
    parentid: '1',
    dn: "LAMP1",
    parseType: "search",
    json: "data.value",
    regexp: "<div\\b[^>]*>(.*?)</div>",
    regexptest: "[a-z0-9]",
    valueTrue: '1',
    valueFalse: 'null',
    flag: "gm",
    rescount: 1,
    number: true,
    actions: [
      {
        act: "on",
        host: "192.168.1.1",
        port: 23,
        username: 'admin',
        password: '230490fF',
        command: '/ip dhcp-server lease print ',
        updatestate: true,
      }
    ],
  }
];


const ps = child.fork(modulepath, [unitid]);

ps.on('message', data => {
  if (data.type === 'get' && data.tablename === `system/${unitid}`) {
    ps.send({ type: 'get', system });
  }

  if (data.type === 'get' && data.tablename === `params/${unitid}`) {
    ps.send({ type: 'get', params });
  }

  if (data.type === 'get' && data.tablename === `config/${unitid}`) {
    ps.send({ type: 'get', config: config2 });
  }

  if (data.type === 'data') {
    console.log('-------------data-------------', new Date().toLocaleString());
    console.log(data.data);
    console.log('');
  }

  if (data.type === 'channels') {
    console.log('-----------channels-----------', new Date().toLocaleString());
    console.log(data.data);
    console.log('');
  }

  if (data.type === 'debug') {
    console.log('-------------debug------------', new Date().toLocaleString());
    console.log(data.txt);
    console.log('');
  }
});

ps.on('close', code => {
  console.log('close');
});

ps.send({type: 'debug', mode: true });

setTimeout(() => {
   ps.send({ type: 'act', data: [ { dn: 'LAMP1', prop: 'on' } ] });
}, 1000)
