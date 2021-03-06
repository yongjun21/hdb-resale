import React from 'react'

export default class Loader extends React.Component {
  render () {
    return (
      <div className='loader-overlay' hidden={this.props.hidden}>
        <i className='loading fa fa-spinner fa-pulse' />
      </div>
    )
  }
}

Loader.propTypes = {
  hidden: React.PropTypes.bool
}
