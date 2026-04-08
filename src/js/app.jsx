import '../css/main.scss';
import React from 'react';
import ReactDOM from 'react-dom';
import PosterBaseApp from './components/PosterBaseApp';
import installPosterMock from './poster/mockPoster';

installPosterMock();

ReactDOM.render(
    <PosterBaseApp />,
    document.getElementById('app-container'),
);
