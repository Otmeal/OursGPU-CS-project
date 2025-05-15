// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;
// @todo
// 1. Label roles after RoleManager Deployment.

import {Script, console} from 'forge-std/Script.sol';
import {Counter} from '../src/Counter.sol';

contract CounterScript is Script {
    Counter public counter;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        counter = new Counter();

        vm.stopBroadcast();
    }
}
