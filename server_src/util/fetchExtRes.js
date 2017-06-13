import fetch from 'node-fetch'
import _ from 'lodash'

export function fetchData () {
  const batchSize = 10000
  const resID = [
    // 'adbbddd3-30e2-445f-a123-29bee150a6fe',
    // '8c00bf08-9124-479e-aeca-7cc411d884c4',
    '83b2fc37-ce8c-4df4-968b-370fd818138b'
  ]

  function fetchOneDataset (dataset, offset, records) {
    const fetchURL =
      'https://data.gov.sg/api/action/datastore_search?' +
      'resource_id=' + dataset + '&sort=_id&' +
      'limit=' + batchSize + '&offset=' + offset
    return fetch(fetchURL)
      .then(data => data.json())
      .then(json => {
        records = records.concat(json.result.records)
        console.log('fetchOneDataset', dataset, offset)
        if (offset + batchSize < json.result.total) return fetchOneDataset(dataset, offset + batchSize, records)
        else return records
      })
      .catch((err) => {
        if (err) throw err
      })
  }

  return Promise.all(resID.map(dataset => fetchOneDataset(dataset, 0, [])))
    .then(recordSet => recordSet.reduce((combined, records) => combined.concat(records), []))
}

export function geocode (block, street, town) {
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
    block + ' ' + street.replace(/'/, '') + ' SINGAPORE&key=' + process.env.GOOGLEMAPS_SERVER_KEY

  return new Promise((resolve, reject) => {
    setTimeout(resolve, 150,
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data.status !== 'OK') throw new Error(data.status)
          let postalCode = data.results[0].address_components.find(el => el.types.indexOf('postal_code') > -1)
          let lng = data.results[0].geometry.location.lng
          let lat = data.results[0].geometry.location.lat
          postalCode = postalCode ? postalCode.short_name : null
          lng = lng === 103.819836 ? null : lng
          lat = lat === 1.352083 ? null : lat
          return {
            'town': town,
            'street': street,
            'block': block,
            'postalCode': postalCode,
            'lng': lng,
            'lat': lat
          }
        })
        .catch(err => {
          if (err.message !== 'ZERO_RESULTS') console.error(err)
          return {
            'town': town,
            'street': street,
            'block': block
          }
        })
    )
  })
}

export function fetchURAdata () {
  console.log('fetching token')
  const tokenUrl = 'https://www.ura.gov.sg/uraDataService/insertNewToken.action'
  const headers = {
    Accept: 'application/json',
    AccessKey: process.env.URASPACE_ACCESS_KEY
  }

  return fetch(tokenUrl, {headers})
    .then(res => res.json())
    .then(json => {
      if (json.Status !== 'Success') throw new Error('fetch api token fail: ' + json.Message)
      console.log('received token')
      return json.Result
    })
    .then(token => {
      headers.Token = token
      const url = 'https://www.ura.gov.sg/uraDataService/invokeUraDS?service=PMI_Resi_Transaction&batch='
      const apiCalls = _.range(4).map(i => {
        return fetch(url + (i + 1), {headers})
          .then(res => res.json())
          .then(json => {
            if (json.Status !== 'Success') throw new Error('fetch private property transactions fail: ' + json.Message)
            return json.Result
          })
      })
      console.log('fetching URA data')
      return Promise.all(apiCalls)
    })
    .then(results => {
      console.log('received URA data')
      return _.flatten(results)
    })
}
