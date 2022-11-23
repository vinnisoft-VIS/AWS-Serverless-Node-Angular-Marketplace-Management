// const {compilerOptions} = require ('./tsconfig');
// // const { NgxBarcodeModule } = require('ngx-barcode');
// const {pathsToModuleNameMapper} = require ('ts-jest/utils/index');

//
// module.exports = {
//   preset: 'jest-preset-angular',
//   roots: ['<rootDir>/src/'],
//   testMatch: ['**/+(*.)+(spec).+(ts)'],
//   setupFilesAfterEnv: ['<rootDir>/src/setupJest.ts'],
//   collectCoverage: true,
//   coverageReporters: ['html'],
//   coverageDirectory: '../../../build/reports/jest/frontend',
//   moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
//     prefix: '<rootDir>/'
//   })
// };

// jest.config.js
// const {defaults} = require('jest-config');

module.exports = {
    preset: 'jest-preset-angular',
    setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
    transformIgnorePatterns: ['<rootDir>/node_modules/(?!ngx-barcode)'],
    testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/'],
    roots: ['<rootDir>/src/'],
    transform: {
        '^.+\\.jsx?$': 'babel-jest'
    },
    moduleNameMapper: {
        '^lodash-es$': 'lodash'
    },
    coverageDirectory: '../../../build/reports/jest/frontend',
    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: '../../../build/reports/jest/frontend',
                outputName: 'clover-jest-report.xml'
            }
        ]
    ]
};
