import React from 'react'
import sortBy from 'lodash/sortBy'

import Table from './Table'
import IconButton from './IconButton'
import Loader from './Loader'
import { capitalizeFirstLetters, getMonthYear, googleMapsStyles } from './helpers.js'

export default class Maps extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      isLoading: false,
      table: {
        title: '',
        colNames: [],
        rows: []
      }
    }

    this.plotHeatmap = this.plotHeatmap.bind(this)
    this.renderData = this.renderData.bind(this)
    this.listAllTransactions = this.listAllTransactions.bind(this)
    this.resetMap = this.resetMap.bind(this)
  }

  plotHeatmap (month, flatType) {
    this.props.db.get('HM' + month)
    .then(doc => {
      this.renderData(doc)
      if (doc.lastUpdate < this.props.lastUpdate) {
        this.getData(month).then(dataPoints => {
          doc.dataPoints = dataPoints
          doc.lastUpdate = this.props.lastUpdate
          this.props.db.put(doc)
            .then(console.log.bind(console))
            .catch(console.error.bind(console))
          this.renderData(doc)
        })
      }
    })
    .catch(() => {
      this.heatmap.setMap(null)
      this.setState({
        isLoading: true
      })
      this.getData(month).then(dataPoints => {
        const doc = {
          '_id': 'HM' + month,
          'lastUpdate': this.props.lastUpdate,
          'dataPoints': dataPoints
        }
        this.props.db.put(doc)
          .then(console.log.bind(console))
          .catch(console.error.bind(console))
        this.renderData(doc)
      })
    })
  }

  getData (month) {
    console.log('retrieving data from MongoDB', month)
    const url = 'https://api.yongjun.sg/hdb/development/heatmap?month=' + month
    return window.fetch(url).then(res => res.json()).then(results => {
      return results.reduce((dataPoints, result) => {
        result.dataPoints.forEach(pt => {
          pt[2] = Math.pow(pt[2], 1.5)
        })
        return Object.assign(dataPoints, {[result.flat_type]: result.dataPoints})
      }, {})
    })
  }

  renderData (dataObj) {
    if (dataObj._id.slice(2) !== this.props.selectedMonth) {
      console.warn('overlapping queries')
      return
    }

    let dataPoints = []
    if (this.props.selectedFlatType !== 'HDB') {
      dataPoints = dataObj.dataPoints[this.props.selectedFlatType]
    } else {
      this.props.flatList.forEach(flatType => {
        if (!(flatType in dataObj.dataPoints)) return
        dataPoints = dataPoints.concat(dataObj.dataPoints[flatType])
      })
    }

    const ticks = dataPoints.map(tick => ({
      location: new google.maps.LatLng(tick[0], tick[1]),
      weight: tick[2]
    }))
    this.heatmap.setData(ticks)
    this.heatmap.setMap(this.map)

    this.setState({
      isLoading: false
    })
  }

  resetMap () {
    this.map.setCenter(this.mapSettings.center)
    this.map.setZoom(this.mapSettings.zoom)
  }

  listAllTransactions (lat, lng, radius, month, flat_type) { //eslint-disable-line
    if (flat_type.match(/^Private/)) {
      const url = 'https://api.yongjun.sg/hdb/development/nearby/private'

      window.fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({lat, lng, radius, month, flat_type})
      }).then(data => data.json())
        .then(json => {
          console.log(json)
          const {projects, transactions} = json
          if (!transactions.length) {
            this.setState({
              table: {
                title: '',
                colNames: [],
                rows: []
              }
            })
            console.log('No result around selected location')
            return
          }

          const title = transactions.length + ' transaction' + (transactions.length > 1 ? 's' : '') +
            ' in ' + getMonthYear(month) + ' <span class="nowrap">around selected location</span>'

          const colNames = [
            '#',
            'District',
            'Project Name',
            'Street Name',
            'Property Type',
            'Storey Range',
            'Sale Type',
            'Tenure',
            'Area (sqm)',
            'No. of units',
            'Price (SGD)'
          ]

          const typeOfSale = ['New Sale', 'Sub Sale', 'Resale']

          const sorted = sortBy(transactions, record =>
            (record.nettPrice || record.price) / record.noOfUnits).reverse()
          const rows = sorted.map((t, i) => ([
            i + 1,
            t.district,
            projects[t.project].project,
            capitalizeFirstLetters(projects[t.project].street),
            t.propertyType
              .replace('Strata Semidetached', 'Strata Semi-D')
              .replace('Executive Condominium', 'EC'),
            t.floorRange,
            typeOfSale[t.typeOfSale],
            t.tenure.replace('lease commencing ', ''),
            t.area,
            t.noOfUnits,
            (t.nettPrice || t.price).toLocaleString()
          ]))

          this.setState({
            table: {title, colNames, rows}
          })
          this.map.setCenter({lat, lng})
          this.map.setZoom(15)
          this.map.setOptions({scrollwheel: false})
          const scrollToTopListener = (e) => {
            if (window.scrollY === 0) {
              window.removeEventListener('scroll', scrollToTopListener)
              this.map.setOptions({scrollwheel: true})
            }
          }
          window.addEventListener('scroll', scrollToTopListener)
        })
    } else {
      const url = 'https://api.yongjun.sg/hdb/development/nearby'
      window.fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({lat, lng, radius})
      }).then(res => res.json()).then(json => {
        if (!json.length) {
          this.setState({
            table: {
              title: '',
              colNames: [],
              rows: []
            }
          })
          console.log('No result around selected location')
          return
        }

        const resID = [
          'adbbddd3-30e2-445f-a123-29bee150a6fe',
          '8c00bf08-9124-479e-aeca-7cc411d884c4',
          '83b2fc37-ce8c-4df4-968b-370fd818138b',
          '1b702208-44bf-4829-b620-4615ee19b57c',
          'f1765b54-a209-4718-8d38-a39237f502b3'
        ]
        const resource =
          month < '2000-01' ? resID[0]
        : month < '2012-03' ? resID[1]
        : month < '2015-01' ? resID[2]
        : month < '2017-01' ? resID[3] : resID[4]
        Promise.all(json.map(street_name => { //eslint-disable-line
          const filters = {street_name, month}
          if (flat_type !== 'HDB') Object.assign(filters, {flat_type: flat_type.replace(/-ROOM$/g, ' ROOM')}) // eslint-disable-line
          const dataURL = `https://data.gov.sg/api/action/datastore_search?resource_id=${resource}&filters=${JSON.stringify(filters)}&limit=5000`
          return window.fetch(dataURL)
            .then(data => data.json())
        }))
        .then(results => results.reduce((records, res) => {
          if (res.result && res.result.records) {
            return records.concat(res.result.records)
          } else {
            return records
          }
        }, []))
        .then(records => {
          if (!json.length) {
            this.setState({
              table: {
                title: '',
                colNames: [],
                rows: []
              }
            })
            console.log('No result around selected location')
            return
          }

          const title = records.length + ' transaction' + (records.length > 1 ? 's' : '') +
            ' in ' + getMonthYear(month) + ' <span class="nowrap">around selected location</span>'
          const colNames = [
            '#',
            'Block',
            'Street Name',
            'Flat Type',
            'Storey Range',
            'Lease Commence',
            'Floor Area (sqm)',
            'Resale Price (SGD)'
          ]

          const transactions = sortBy(records,
            record => +record.resale_price).reverse()
          const rows = transactions.map((transaction, index) => ([
            index + 1,
            transaction.block.trim(),
            capitalizeFirstLetters(transaction.street_name.trim()),
            transaction.flat_type.trim(),
            transaction.storey_range.trim().toLowerCase(),
            transaction.lease_commence_date,
            transaction.floor_area_sqm,
            (+transaction.resale_price).toLocaleString()
          ]))

          this.setState({
            table: {title, colNames, rows}
          })
          this.map.setCenter({lat, lng})
          this.map.setZoom(15)
          this.map.setOptions({scrollwheel: false})
          const scrollToTopListener = (e) => {
            if (window.scrollY === 0) {
              window.removeEventListener('scroll', scrollToTopListener)
              this.map.setOptions({scrollwheel: true})
            }
          }
          window.addEventListener('scroll', scrollToTopListener)
        })
      })
    }
  }

  componentDidMount () {
    const initMap = () => {
      this.mapSettings = {
        center: new google.maps.LatLng(1.352083, 103.819836),
        zoom: 11
      }
      this.map = new google.maps.Map(this.refs.map, {
        center: this.mapSettings.center,
        zoom: this.mapSettings.zoom,
        minZoom: 11,
        maxZoom: 16,
        styles: googleMapsStyles.blueWater
      })
      this.heatmap = new google.maps.visualization.HeatmapLayer({
        radius: 7
      })
      this.drawing = new google.maps.drawing.DrawingManager({
        drawingMode: 'circle',
        drawingControlOptions: {
          drawingModes: ['circle'],
          position: google.maps.ControlPosition.TOP_CENTER
        },
        circleOptions: {
          fillColor: 'black',
          fillOpacity: 0.2,
          strokeWeight: 0.5,
          strokeColor: 'black'
        }
      })
      let panLimits
      google.maps.event.addListenerOnce(this.map, 'bounds_changed', () => {
        const bounds = this.map.getBounds()
        const sw = bounds.getSouthWest()
        const ne = bounds.getNorthEast()
        panLimits = new google.maps.LatLngBounds({
          lat: sw.lat() * 0.75 + ne.lat() * 0.25,
          lng: sw.lng() * 0.75 + ne.lng() * 0.25
        }, {
          lat: sw.lat() * 0.25 + ne.lat() * 0.75,
          lng: sw.lng() * 0.25 + ne.lng() * 0.75
        })
      })
      let lastCenter = this.map.getCenter()
      this.map.addListener('center_changed', () => {
        const newCenter = this.map.getCenter()
        if (panLimits.contains(newCenter)) lastCenter = newCenter
        else this.map.setCenter(lastCenter)
      })
      this.drawing.addListener('circlecomplete', c => {
        const center = c.getCenter()
        const radius = Math.min(c.getRadius(), 500)
        this.listAllTransactions(center.lat(), center.lng(), radius,
          this.props.selectedMonth, this.props.selectedFlatType)
        c.setMap(null)
      })
      this.drawing.setMap(this.map)

      this.plotHeatmap(this.props.selectedMonth, this.props.selectedFlatType)
      window.onresize = () => {
        this.resetMap()
      }
    }
    if (window.googleMapsLoaded) initMap()
    else window.googleOnLoadCallback = initMap
  }

  componentWillReceiveProps (nextProps) {
    if (this.props.selectedMonth === nextProps.selectedMonth &&
      this.props.selectedFlatType === nextProps.selectedFlatType) return
    this.setState({
      table: {
        title: '',
        colNames: [],
        rows: []
      }
    })
    this.plotHeatmap(nextProps.selectedMonth, nextProps.selectedFlatType)
  }

  render () {
    const monthList = this.props.monthList
    const currentMonthIndex = monthList.indexOf(this.props.selectedMonth)
    const prevMonth = monthList[Math.max(0, currentMonthIndex - 1)]
    const nextMonth = monthList[Math.min(monthList.length - 1, currentMonthIndex + 1)]

    return (
      <main>
        <h1 className='chart-title'>
          Property Hotspots in {getMonthYear(this.props.selectedMonth)}
        </h1>
        <div className='chart-container'>
          <div id='map' ref='map' />
          <Loader hidden={!this.state.isLoading} />
          <IconButton id='reset-map' icon='fa-crosshairs'
            handleClick={this.resetMap} />
          <IconButton id='prev-month' icon='fa-angle-left'
            value={prevMonth} handleClick={this.props.updateMonth} />
          <IconButton id='next-month' icon='fa-angle-right'
            value={nextMonth} handleClick={this.props.updateMonth} />
        </div>
        <Table {...this.state.table} />
      </main>
    )
  }
}

Maps.propTypes = {
  selectedMonth: React.PropTypes.string,
  selectedFlatType: React.PropTypes.string,
  lastUpdate: React.PropTypes.string,
  monthList: React.PropTypes.arrayOf(React.PropTypes.string),
  flatList: React.PropTypes.arrayOf(React.PropTypes.string),
  updateMonth: React.PropTypes.func,
  db: React.PropTypes.object
}
