# Pipeline Desk

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developer using Windows and watching GitLab pipelines across many browser tabs.

## Product Purpose

Observe the latest pipelines, their project and stage status in pinned desktop widgets.

## Capabilities and Constraints

User requested minimal copy, minimalist interface, animations and motion design.
One overview, individual project windows and multi-project group windows. Compact rows and short individual widgets are user-requested modes.
Electron with plain HTML/CSS/JavaScript is an implementation choice for native Windows always-on-top windows.
The user's GitLab server and encrypted connection are configured locally. Samples remain explicitly marked as demo whenever disconnected.
Users can compose local groups from individual projects, GitLab groups with optional subgroups, and existing local groups. GitLab membership is read-only and automatically refreshed. Repository links open on the configured server.
Monitor only: do not run, retry, cancel, deploy or modify GitLab jobs.

## Evidence on Hand

Screenshot: AЕDON / supply-demand-platform / supply-demand-backend, main, pipeline #8553, quality → build → migrations → deploy.
Screenshot is reference data, not live evidence.
