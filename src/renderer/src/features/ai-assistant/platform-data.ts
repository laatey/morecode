import docker from '@/assets/stack/docker.svg'
import github from '@/assets/stack/github.svg'
import go from '@/assets/stack/go.svg'
import js from '@/assets/stack/js.svg'
import metabase from '@/assets/stack/metabase.svg'
import mongodb from '@/assets/stack/mongodb.svg'
import mysql from '@/assets/stack/mysql.svg'
import n8n from '@/assets/stack/n8n.svg'
import nextjs from '@/assets/stack/nextjs.svg'
import postgres from '@/assets/stack/postgresql.svg'
import python from '@/assets/stack/python.svg'
import redis from '@/assets/stack/redis.svg'
import rust from '@/assets/stack/rust.svg'
import sqlite from '@/assets/stack/sqlite.svg'
import strapi from '@/assets/stack/strapi.svg'
import vite from '@/assets/stack/vite.svg'
import generic from '@/assets/stack/generic.svg'
import terminal from '@/assets/stack/terminal.svg'

export const logos = {
  docker,
  github,
  go,
  js,
  metabase,
  mongodb,
  mysql,
  n8n,
  nextjs,
  postgres,
  python,
  redis,
  rust,
  sqlite,
  strapi,
  vite,
  generic,
  terminal
}

export type LogoKey = keyof typeof logos
