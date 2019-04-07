'use strict';

module.exports = function(config) {
  const udp = require('dgram');
  const buffer = require('buffer');
  const http_request = require("request");
  this.config = config;

  const _getReading = function(DEVICE_IP) {
    return new Promise( async function (resolve, reject)  {
        let meter = {};
        const client = udp.createSocket('udp4');
        client.on('message',function(msg,info){
          let json = JSON.parse(msg.toString());

          if(json.ID == '1') {
            meter.meterId=json.Product+"_"+json.Serial;
            meter.externalAccount = json.Serial;
            client.send(Buffer.from("report 3"),7090,DEVICE_IP,function(error){
            });
          } else if(json.ID == '3') {
            meter["1.8.0"] = json["E total"];
            meter.timeStamp = new Date().getTime();
            meter.DEVICE_IP = DEVICE_IP;
            meter.zip=config.zip;
            
            //console.log(meter);
            client.close();
            resolve([meter]);
          }
        });
        client.on('error',function(error){
            client.close();
        });
        client.bind(7090);
        client.send(Buffer.from("report 1"),7090,DEVICE_IP,function(error){
          if(error){
            client.close();
            resolve({});
          }else{
              console.log("SENT TO",DEVICE_IP);
          }
        });
    });
  }

  let meters2 = [];

  const _probeNETWORK = function(DEVICE_IP) {
    return new Promise( async function (resolve, reject)  {
      let network_parts = DEVICE_IP.split('.');
      let network = network_parts[0]+"."+network_parts[1]+"."+network_parts[2]+".";

      let resolves = [];
      for(let i=0; i < 254; i++) {
        const readings = async function() {
          return new Promise( async function (resolve2, reject)  {
            try {
          _getReading(network+""+i).then(async function(meter) {
            try {
             if(meter.length>0) {
                for(let j = 0; j < meter.length; j++) {
                  meter[j] = await _getGSI(meter[j]);
                  meters2.push(meter[j]);
                }
             }
             resolve2(meters2);
           } catch(e) {
             resolve2(meters2);
           }
           });
         } catch(e) {
              resolve2(meters2);
         }
         });
        }
        resolves.push(readings());
      }
      let resolved = 0;
      for(let i=0;i<resolves.length;i++) {
        resolves[i].then(function(x) {
            resolved++;
        });
      }
      let timeout=5;
      const doWait = function() {
        timeout--;
        if((resolved<resolves.length-1)&&(timeout>0)) {
          setTimeout(doWait,1000);
        } else {
            resolve(meters2);
        }
      }
      doWait();
    });
  }

  const  _getGSI = function(meter) {
    return new Promise( async function (resolve, reject)  {
      let gsidata = {};
      gsidata.zip = meter.zip;
      gsidata.externalAccount = meter.externalAccount;
      gsidata.energy = meter["1.8.0"];
      gsidata.secret = meter.meterId;
      gsidata.timeStamp = meter.timeStamp;
      http_request.post("https://api.corrently.io/core/reading",{form:gsidata},function(e,r,b) {
        let _gsi = JSON.parse(b);
        if(typeof _gsi["account"] != "undefined") meter.account = _gsi["account"];
        if(typeof _gsi["1.8.1"] != "undefined") meter["1.8.1"] = _gsi["1.8.1"]*1;
        if(typeof _gsi["1.8.2"] != "undefined") meter["1.8.2"] = _gsi["1.8.2"]*1;
        resolve(meter);
      })
    });
  }


  this.meter = async function(query,subquery) {
    let parent = this;
    return new Promise( async function (resolve, reject)  {
      _getReading(query).then(async function(meter) {
         if(meter.length>0) {
           if(subquery != null) {
            for(let j = 0; j < meter.length; j++) {
                if(meter[j].meterId.indexOf(subquery)>-1) {
                  meter[j] = await _getGSI(meter[j]);
                  resolve(meter[j]);
                }
            }
         } else {
           meter[0] = await _getGSI(meter[0]);
           resolve(meter[0]);
         }
       }
     });
    });
  }

  this.REQUIREDCONFIGS = ["zip"];
}
