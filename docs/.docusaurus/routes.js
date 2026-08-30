import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/docs/',
    component: ComponentCreator('/docs/', '6fa'),
    exact: true
  },
  {
    path: '/docs/',
    component: ComponentCreator('/docs/', '9bc'),
    routes: [
      {
        path: '/docs/',
        component: ComponentCreator('/docs/', 'efe'),
        routes: [
          {
            path: '/docs/',
            component: ComponentCreator('/docs/', '6e6'),
            routes: [
              {
                path: '/docs/configuration/',
                component: ComponentCreator('/docs/configuration/', '3a5'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/configuration/capabilities',
                component: ComponentCreator('/docs/configuration/capabilities', '1aa'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/configuration/detection',
                component: ComponentCreator('/docs/configuration/detection', '4f6'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/configuration/environment',
                component: ComponentCreator('/docs/configuration/environment', '664'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/configuration/persistence',
                component: ComponentCreator('/docs/configuration/persistence', 'cef'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/configuration/smoothing',
                component: ComponentCreator('/docs/configuration/smoothing', '838'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/configuration/tracking',
                component: ComponentCreator('/docs/configuration/tracking', 'dca'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/configuration/zones',
                component: ComponentCreator('/docs/configuration/zones', '723'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/deployment/docker',
                component: ComponentCreator('/docs/deployment/docker', '000'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/deployment/gpu-acceleration',
                component: ComponentCreator('/docs/deployment/gpu-acceleration', 'f3b'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/development/architecture',
                component: ComponentCreator('/docs/development/architecture', 'a70'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/development/modules',
                component: ComponentCreator('/docs/development/modules', 'd2e'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/development/roadmap',
                component: ComponentCreator('/docs/development/roadmap', '12c'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/',
                component: ComponentCreator('/docs/intro/', '4e1'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/camera-setup',
                component: ComponentCreator('/docs/intro/camera-setup', 'dc0'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/glossary',
                component: ComponentCreator('/docs/intro/glossary', 'd87'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/hardware',
                component: ComponentCreator('/docs/intro/hardware', '927'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/installation',
                component: ComponentCreator('/docs/intro/installation', 'ae1'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/network',
                component: ComponentCreator('/docs/intro/network', 'eeb'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/planning',
                component: ComponentCreator('/docs/intro/planning', 'c77'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/updating',
                component: ComponentCreator('/docs/intro/updating', 'b81'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/intro/video-pipeline',
                component: ComponentCreator('/docs/intro/video-pipeline', '04e'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/platform/api',
                component: ComponentCreator('/docs/platform/api', '38b'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/platform/data-layer',
                component: ComponentCreator('/docs/platform/data-layer', '47a'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/platform/media',
                component: ComponentCreator('/docs/platform/media', '92f'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/usage/explore',
                component: ComponentCreator('/docs/usage/explore', 'f82'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/usage/live',
                component: ComponentCreator('/docs/usage/live', '8a3'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/usage/review',
                component: ComponentCreator('/docs/usage/review', '031'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/usage/system',
                component: ComponentCreator('/docs/usage/system', '00f'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/usage/zone-editor',
                component: ComponentCreator('/docs/usage/zone-editor', '604'),
                exact: true,
                sidebar: "docs"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
