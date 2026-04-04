// City, Zone, and Dark Store Data
const cityData = {
  mumbai: {
    name: 'Mumbai',
    zones: {
      'Andheri West': {
        lat: 19.1360, lng: 72.8296, risk: 65, pin: '400053',
        stores: [
          { id: 'BLK-ANW-01', name: 'Blinkit DN Nagar', platform: 'blinkit', lat: 19.1340, lng: 72.8280 },
          { id: 'BLK-ANW-02', name: 'Blinkit Lokhandwala', platform: 'blinkit', lat: 19.1390, lng: 72.8310 },
          { id: 'ZPT-ANW-01', name: 'Zepto Andheri Hub', platform: 'zepto', lat: 19.1370, lng: 72.8260 },
          { id: 'IM-ANW-01', name: 'Instamart Andheri', platform: 'instamart', lat: 19.1355, lng: 72.8300 }
        ]
      },
      'Bandra East': {
        lat: 19.0596, lng: 72.8511, risk: 45, pin: '400051',
        stores: [
          { id: 'BLK-BDE-01', name: 'Blinkit BKC', platform: 'blinkit', lat: 19.0580, lng: 72.8520 },
          { id: 'ZPT-BDE-01', name: 'Zepto Bandra Hub', platform: 'zepto', lat: 19.0610, lng: 72.8490 },
          { id: 'IM-BDE-01', name: 'Instamart BKC', platform: 'instamart', lat: 19.0600, lng: 72.8505 }
        ]
      },
      'Powai': {
        lat: 19.1176, lng: 72.9060, risk: 35, pin: '400076',
        stores: [
          { id: 'BLK-POW-01', name: 'Blinkit Hiranandani', platform: 'blinkit', lat: 19.1190, lng: 72.9080 },
          { id: 'ZPT-POW-01', name: 'Zepto Powai Hub', platform: 'zepto', lat: 19.1160, lng: 72.9040 },
          { id: 'IM-POW-01', name: 'Instamart Powai', platform: 'instamart', lat: 19.1170, lng: 72.9050 }
        ]
      },
      'Malad West': {
        lat: 19.1872, lng: 72.8484, risk: 72, pin: '400064',
        stores: [
          { id: 'BLK-MLW-01', name: 'Blinkit Malad Hub', platform: 'blinkit', lat: 19.1860, lng: 72.8470 },
          { id: 'ZPT-MLW-01', name: 'Zepto Malad Station', platform: 'zepto', lat: 19.1880, lng: 72.8500 },
          { id: 'IM-MLW-01', name: 'Instamart Malad', platform: 'instamart', lat: 19.1870, lng: 72.8490 }
        ]
      }
    }
  },
  chennai: {
    name: 'Chennai',
    zones: {
      'T. Nagar': {
        lat: 13.0418, lng: 80.2341, risk: 40, pin: '600017',
        stores: [
          { id: 'BLK-TNG-01', name: 'Blinkit T. Nagar', platform: 'blinkit', lat: 13.0410, lng: 80.2330 },
          { id: 'ZPT-TNG-01', name: 'Zepto Pondy Bazaar', platform: 'zepto', lat: 13.0430, lng: 80.2350 },
          { id: 'IM-TNG-01', name: 'Instamart T. Nagar', platform: 'instamart', lat: 13.0420, lng: 80.2340 }
        ]
      },
      'Adyar': {
        lat: 13.0067, lng: 80.2572, risk: 55, pin: '600020',
        stores: [
          { id: 'BLK-ADY-01', name: 'Blinkit Adyar', platform: 'blinkit', lat: 13.0060, lng: 80.2560 },
          { id: 'ZPT-ADY-01', name: 'Zepto Adyar Hub', platform: 'zepto', lat: 13.0080, lng: 80.2580 },
          { id: 'IM-ADY-01', name: 'Instamart Adyar', platform: 'instamart', lat: 13.0070, lng: 80.2570 }
        ]
      },
      'Velachery': {
        lat: 12.9815, lng: 80.2180, risk: 68, pin: '600042',
        stores: [
          { id: 'BLK-VEL-01', name: 'Blinkit Velachery', platform: 'blinkit', lat: 12.9810, lng: 80.2170 },
          { id: 'ZPT-VEL-01', name: 'Zepto Velachery Hub', platform: 'zepto', lat: 12.9820, lng: 80.2190 },
          { id: 'BLK-VEL-02', name: 'Blinkit Phoenix Mall', platform: 'blinkit', lat: 12.9830, lng: 80.2200 },
          { id: 'IM-VEL-01', name: 'Instamart Velachery', platform: 'instamart', lat: 12.9825, lng: 80.2185 }
        ]
      },
      'Anna Nagar': {
        lat: 13.0850, lng: 80.2101, risk: 38, pin: '600040',
        stores: [
          { id: 'BLK-ANN-01', name: 'Blinkit Anna Nagar', platform: 'blinkit', lat: 13.0840, lng: 80.2090 },
          { id: 'ZPT-ANN-01', name: 'Zepto Anna Nagar Hub', platform: 'zepto', lat: 13.0860, lng: 80.2110 },
          { id: 'IM-ANN-01', name: 'Instamart Anna Nagar', platform: 'instamart', lat: 13.0850, lng: 80.2100 }
        ]
      },
      'OMR (Sholinganallur)': {
        lat: 12.9010, lng: 80.2279, risk: 48, pin: '600119',
        stores: [
          { id: 'BLK-OMR-01', name: 'Blinkit OMR Hub', platform: 'blinkit', lat: 12.9000, lng: 80.2270 },
          { id: 'ZPT-OMR-01', name: 'Zepto Sholinganallur', platform: 'zepto', lat: 12.9020, lng: 80.2290 },
          { id: 'IM-OMR-01', name: 'Instamart OMR', platform: 'instamart', lat: 12.9010, lng: 80.2280 }
        ]
      }
    }
  },
  kolkata: {
    name: 'Kolkata',
    zones: {
      'Salt Lake': {
        lat: 22.5800, lng: 88.4179, risk: 58, pin: '700091',
        stores: [
          { id: 'BLK-SLK-01', name: 'Blinkit Salt Lake', platform: 'blinkit', lat: 22.5790, lng: 88.4170 },
          { id: 'ZPT-SLK-01', name: 'Zepto Salt Lake Hub', platform: 'zepto', lat: 22.5810, lng: 88.4190 },
          { id: 'IM-SLK-01', name: 'Instamart Salt Lake', platform: 'instamart', lat: 22.5800, lng: 88.4180 }
        ]
      },
      'New Town': {
        lat: 22.5926, lng: 88.4845, risk: 42, pin: '700156',
        stores: [
          { id: 'BLK-NTN-01', name: 'Blinkit New Town', platform: 'blinkit', lat: 22.5920, lng: 88.4840 },
          { id: 'ZPT-NTN-01', name: 'Zepto New Town Hub', platform: 'zepto', lat: 22.5930, lng: 88.4850 },
          { id: 'IM-NTN-01', name: 'Instamart New Town', platform: 'instamart', lat: 22.5925, lng: 88.4845 }
        ]
      },
      'Gariahat': {
        lat: 22.5170, lng: 88.3690, risk: 62, pin: '700019',
        stores: [
          { id: 'BLK-GRH-01', name: 'Blinkit Gariahat', platform: 'blinkit', lat: 22.5165, lng: 88.3685 },
          { id: 'ZPT-GRH-01', name: 'Zepto Gariahat Hub', platform: 'zepto', lat: 22.5175, lng: 88.3695 },
          { id: 'IM-GRH-01', name: 'Instamart Gariahat', platform: 'instamart', lat: 22.5170, lng: 88.3690 }
        ]
      },
      'Howrah': {
        lat: 22.5958, lng: 88.2636, risk: 70, pin: '711101',
        stores: [
          { id: 'BLK-HWR-01', name: 'Blinkit Howrah', platform: 'blinkit', lat: 22.5950, lng: 88.2630 },
          { id: 'ZPT-HWR-01', name: 'Zepto Howrah Hub', platform: 'zepto', lat: 22.5960, lng: 88.2640 },
          { id: 'IM-HWR-01', name: 'Instamart Howrah', platform: 'instamart', lat: 22.5955, lng: 88.2635 }
        ]
      }
    }
  }
};