/* eslint-disable camelcase */
import hashSum from "hash-sum"
import { cleanup, exists, readdir, readFile } from "test/vitest/utils"
import { expect } from "vitest"

import type { MetaEpisode, MetaManga } from "./download-manager"
import { createTaskDownloadEpisode, getListManga } from "./download-manager"

global.fetch = vi.fn()
global.Date.now = vi.fn()

const route = {
  name: "comic" as const,
  params: {
    comic: "manga-1"
  }
}
const manga_id = "1"
const manga_name = "Manga 1"
const manga_image = "http://localhost/poster/manga-1.jpg"
const source_id = "nettruyen"
const ep_id = "1234"
const ep_name = "Chapter 1"
const pages = [
  "https://localhost/pages/1.png",
  "https://localhost/pages/2.png",
  "https://localhost/pages/3.png",
  "https://localhost/pages/4.png",
  "https://localhost/pages/5.png",
  "https://localhost/pages/6.png",
  "https://localhost/pages/7.png",
  "https://localhost/pages/8.png",
]
const routeEp = {
  name: "comic chap" as const,
  params: {
    comic: route.params.comic,
    chap: '2'
  }
}

const metaManga: MetaManga = {
  route,
  manga_id,
  manga_image,
  manga_name,
  source_id,
}
const metaEp: MetaEpisode = {
  route: routeEp,
  ep_id,
  ep_name,
  pages,
}

const hashIDManga = hashSum(manga_id)
const hashIDEp = hashSum(ep_id)

function patchFetch() {
  // continue download
  ;(fetch as ReturnType<typeof vi.fn>).mockReset()
  ;(fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url) => {
    await sleep(100)
    return Promise.resolve({
      async arrayBuffer() {
        return new TextEncoder().encode(url)
      },
      async text() {
        return url
      },
    })
  })
}
;(Date.now as ReturnType<typeof vi.fn>).mockReturnValue(0)
patchFetch()

describe("download-manager", () => {
  beforeEach(async () => {
    await cleanup()
    await sleep(1000)
  })

  test("should download episode x for the first time", async () => {
    const { ref, start, downloading } = createTaskDownloadEpisode(
      metaManga,
      metaEp,
    )
    expect(ref.downloaded).toBe(0)
    expect(downloading.value).toBeFalsy()

    const watcher = vi.fn()
    watch(ref, watcher, { deep: true })

    await start()

    // check directory
    await expect(readdir("")).resolves.toEqual(["files", "meta", "poster"])

    await expect(readdir("files")).resolves.toEqual([hashIDManga])
    await expect(readdir("files/" + hashIDManga)).resolves.toEqual([hashIDEp])

    await expect(readdir("meta")).resolves.toEqual([
      hashIDManga,
      hashIDManga + ".mod",
    ])
    await expect(readdir("meta/" + hashIDManga)).resolves.toEqual([
      hashIDEp + ".mod",
    ])

    await expect(readdir("poster")).resolves.toEqual([hashIDManga])

    expect(await readdir(`files/${hashIDManga}/${hashIDEp}`)).toEqual([
      "1a96284a",
      "1a96284b",
      "1a96284c",
      "1a96284d",
      "1a96284e",
      "1a96284f",
      "1a962850",
      "1a962851",
    ])

    // valid image pages
    for (const index in pages) {
      const path = `files/${hashIDManga}/${hashIDEp}/${hashSum(+index)}`

      expect(await readFile(path, Encoding.UTF8)).toBe(pages[index])
    }

    // valid meta manga
    expect(
      JSON.parse(await readFile(`meta/${hashIDManga}.mod`, Encoding.UTF8)),
    ).toEqual({
      ...metaManga,
      manga_image: "offline:///poster/8daa1a0a",
      start_download_at: 0,
    })

    // valid meta episode
    expect(
      JSON.parse(
        await readFile(`meta/${hashIDManga}/${hashIDEp}.mod`, Encoding.UTF8),
      ),
    ).toEqual({
      path: routeEp,
      start_download_at: 0,
      downloaded: 8,
      ep_id,
      ep_name,
      pages: [
        "offline://files/8daa1a0a/2d0aa938/1a96284a",
        "offline://files/8daa1a0a/2d0aa938/1a96284b",
        "offline://files/8daa1a0a/2d0aa938/1a96284c",
        "offline://files/8daa1a0a/2d0aa938/1a96284d",
        "offline://files/8daa1a0a/2d0aa938/1a96284e",
        "offline://files/8daa1a0a/2d0aa938/1a96284f",
        "offline://files/8daa1a0a/2d0aa938/1a962850",
        "offline://files/8daa1a0a/2d0aa938/1a962851",
      ],
    })

    // valid meta image
    expect(await readFile("poster/" + hashIDManga, Encoding.UTF8)).toBe(
      manga_image,
    )
    expect(watcher.mock.calls.length).toBe(8)
  })

  test("should forcibly stopped while downloading", async () => {
    let counter = 0
    ;(fetch as ReturnType<typeof vi.fn>).mockReset()
    ;(fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url) => {
      // await sleep(500)
      if (counter++ > 5) return Promise.reject(new Error("time_out"))

      return Promise.resolve({
        async arrayBuffer() {
          return new TextEncoder().encode(url)
        },
        async text() {
          return url
        },
      })
    })

    const { ref, start, downloading } = createTaskDownloadEpisode(
      metaManga,
      metaEp,
    )
    expect(ref.downloaded).toBe(0)
    expect(downloading.value).toBeFalsy()

    await start().catch(() => null)

    // check hash file page
    expect(await readdir(`files/${hashIDManga}/${hashIDEp}`)).toEqual([
      "1a96284a",
      "1a96284b",
      "1a96284c",
      "1a96284d",
      "1a96284e",
    ])

    // valid image page
    for (const index in pages.slice(0, 5)) {
      const path = `files/${hashIDManga}/${hashIDEp}/${hashSum(+index)}`

      expect(await readFile(path, Encoding.UTF8)).toBe(pages[index])
    }

    // valid meta
    expect(
      JSON.parse(
        await readFile(
          "meta/" + hashIDManga + "/" + hashIDEp + ".mod",
          Encoding.UTF8,
        ),
      ),
    ).toEqual({
      path: routeEp,
      start_download_at: 0,
      downloaded: 5,
      ep_id,
      ep_name,
      pages: [
        "offline://files/8daa1a0a/2d0aa938/1a96284a",
        "offline://files/8daa1a0a/2d0aa938/1a96284b",
        "offline://files/8daa1a0a/2d0aa938/1a96284c",
        "offline://files/8daa1a0a/2d0aa938/1a96284d",
        "offline://files/8daa1a0a/2d0aa938/1a96284e",
        "https://localhost/pages/6.png",
        "https://localhost/pages/7.png",
        "https://localhost/pages/8.png",
      ],
    })
  })

  test("should continue while downloading", async () => {
    let counter = 0
    ;(fetch as ReturnType<typeof vi.fn>).mockReset()
    ;(fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url) => {
      // await sleep(500)
      if (counter++ > 5) return Promise.reject(new Error("time_out"))

      return Promise.resolve({
        async arrayBuffer() {
          return new TextEncoder().encode(url)
        },
        async text() {
          return url
        },
      })
    })

    const { ref, start, downloading } = createTaskDownloadEpisode(
      metaManga,
      metaEp,
    )
    expect(ref.downloaded).toBe(0)
    expect(downloading.value).toBeFalsy()

    await start().catch(() => null)
    patchFetch()

    // check hash file page
    expect(await readdir(`files/${hashIDManga}/${hashIDEp}`)).toEqual([
      "1a96284a",
      "1a96284b",
      "1a96284c",
      "1a96284d",
      "1a96284e",
    ])

    // valid image page
    for (const index in pages.slice(0, 5)) {
      const path = `files/${hashIDManga}/${hashIDEp}/${hashSum(+index)}`

      expect(await readFile(path, Encoding.UTF8)).toBe(pages[index])
    }

    // valid meta
    expect(
      JSON.parse(
        await readFile(
          "meta/" + hashIDManga + "/" + hashIDEp + ".mod",
          Encoding.UTF8,
        ),
      ),
    ).toEqual({
      path: routeEp,
      ep_id,
      ep_name,
      start_download_at: 0,
      downloaded: 5,
      pages: [
        "offline://files/8daa1a0a/2d0aa938/1a96284a",
        "offline://files/8daa1a0a/2d0aa938/1a96284b",
        "offline://files/8daa1a0a/2d0aa938/1a96284c",
        "offline://files/8daa1a0a/2d0aa938/1a96284d",
        "offline://files/8daa1a0a/2d0aa938/1a96284e",
        "https://localhost/pages/6.png",
        "https://localhost/pages/7.png",
        "https://localhost/pages/8.png",
      ],
    })

    const {
      ref: ref2,
      start: start2,
      downloading: dl2,
    } = createTaskDownloadEpisode(metaManga, metaEp)
    expect(ref2.downloaded).toBe(0)
    expect(dl2.value).toBeFalsy()

    await start2().catch(() => null)

    // check hash file page
    expect(await readdir(`files/${hashIDManga}/${hashIDEp}`)).toEqual([
      "1a96284a",
      "1a96284b",
      "1a96284c",
      "1a96284d",
      "1a96284e",
      "1a96284f",
      "1a962850",
      "1a962851",
    ])

    // valid image pages
    for (const index in pages) {
      const path = `files/${hashIDManga}/${hashIDEp}/${hashSum(+index)}`

      expect(await readFile(path, Encoding.UTF8)).toBe(pages[index])
    }

    // valid meta
    expect(
      JSON.parse(
        await readFile(
          "meta/" + hashIDManga + "/" + hashIDEp + ".mod",
          Encoding.UTF8,
        ),
      ),
    ).toEqual({
      path: routeEp,
      start_download_at: 0,
      downloaded: 8,
      ep_id,
      ep_name,
      pages: [
        "offline://files/8daa1a0a/2d0aa938/1a96284a",
        "offline://files/8daa1a0a/2d0aa938/1a96284b",
        "offline://files/8daa1a0a/2d0aa938/1a96284c",
        "offline://files/8daa1a0a/2d0aa938/1a96284d",
        "offline://files/8daa1a0a/2d0aa938/1a96284e",
        "offline://files/8daa1a0a/2d0aa938/1a96284f",
        "offline://files/8daa1a0a/2d0aa938/1a962850",
        "offline://files/8daa1a0a/2d0aa938/1a962851",
      ],
    })
  })

  // test("should run multiple download episodes", async () => {})

  test("should download stop and resume", async () => {
    patchFetch()

    const { ref, downloading, start, stop, resume } = createTaskDownloadEpisode(
      metaManga,
      metaEp,
    )
    expect(downloading.value).toBe(false)
    expect(ref.downloaded).toBe(0)

    const watcher = vi.fn()
    watch(ref, watcher, { deep: true })

    start()
    await sleep(500)
    expect(downloading.value).toBe(true)
    expect(ref.downloaded).toBeGreaterThanOrEqual(1)

    stop()
    await sleep(500)

    expect(downloading.value).toBe(false)
    expect(ref.downloaded).toBeGreaterThanOrEqual(1)

    const promise = resume()
    expect(downloading.value).toBe(true)
    expect(ref.downloaded).toBeGreaterThanOrEqual(1)

    await promise

    // check hash file page
    expect(await readdir(`files/${hashIDManga}/${hashIDEp}`)).toEqual([
      "1a96284a",
      "1a96284b",
      "1a96284c",
      "1a96284d",
      "1a96284e",
      "1a96284f",
      "1a962850",
      "1a962851",
    ])

    // valid image pages
    for (const index in pages) {
      const path = `files/${hashIDManga}/${hashIDEp}/${hashSum(+index)}`

      expect(await readFile(path, Encoding.UTF8)).toBe(pages[index])
    }

    // valid meta
    expect(
      JSON.parse(
        await readFile(
          "meta/" + hashIDManga + "/" + hashIDEp + ".mod",
          Encoding.UTF8,
        ),
      ),
    ).toEqual({
      path: routeEp,
      start_download_at: 0,
      downloaded: 8,
      ep_id,
      ep_name,
      pages: [
        "offline://files/8daa1a0a/2d0aa938/1a96284a",
        "offline://files/8daa1a0a/2d0aa938/1a96284b",
        "offline://files/8daa1a0a/2d0aa938/1a96284c",
        "offline://files/8daa1a0a/2d0aa938/1a96284d",
        "offline://files/8daa1a0a/2d0aa938/1a96284e",
        "offline://files/8daa1a0a/2d0aa938/1a96284f",
        "offline://files/8daa1a0a/2d0aa938/1a962850",
        "offline://files/8daa1a0a/2d0aa938/1a962851",
      ],
    })
  })

  test("should get list manga downloaded", async () => {
    await createTaskDownloadEpisode(metaManga, metaEp).start()

    // ok get list

    expect(await getListManga()).toEqual([
      {
        route,
        manga_id,
        manga_image: "offline:///poster/8daa1a0a",
        manga_name,
        source_id,
        start_download_at: 0,
      },
    ])

    const meta2 = {
      ...metaManga,
      manga_id: "2",
    }

    await createTaskDownloadEpisode(meta2, metaEp).start()

    expect(await getListManga()).toEqual([
      {
        route,
        manga_id: "2",
        manga_image: "offline:///poster/8daa1a08",
        manga_name,
        source_id,
        start_download_at: 0,
      },
      {
        route,
        manga_id,
        manga_image: "offline:///poster/8daa1a0a",
        manga_name,
        source_id,
        start_download_at: 0,
      },
    ])
  })

  test("should get list episodes downloaded", async () => {
    await createTaskDownloadEpisode(metaManga, metaEp).start()

    // ok get list
    expect(await getListEpisodes(manga_id)).toEqual([
      {
        path: routeEp,
        start_download_at: 0,
        downloaded: 8,
        ep_id,
        ep_name,
        pages: [
          "offline://files/8daa1a0a/2d0aa938/1a96284a",
          "offline://files/8daa1a0a/2d0aa938/1a96284b",
          "offline://files/8daa1a0a/2d0aa938/1a96284c",
          "offline://files/8daa1a0a/2d0aa938/1a96284d",
          "offline://files/8daa1a0a/2d0aa938/1a96284e",
          "offline://files/8daa1a0a/2d0aa938/1a96284f",
          "offline://files/8daa1a0a/2d0aa938/1a962850",
          "offline://files/8daa1a0a/2d0aa938/1a962851",
        ],
      },
    ])
    ;(Date.now as ReturnType<typeof vi.fn>).mockReturnValue(1)

    await createTaskDownloadEpisode(metaManga, {
      ...metaEp,
      ep_id: metaEp.ep_id + 1,
    }).start()

    expect(await getListEpisodes(manga_id)).toEqual([
      {
        path: routeEp,
        start_download_at: 0,
        downloaded: 8,
        ep_id,
        ep_name,
        pages: [
          "offline://files/8daa1a0a/2d0aa938/1a96284a",
          "offline://files/8daa1a0a/2d0aa938/1a96284b",
          "offline://files/8daa1a0a/2d0aa938/1a96284c",
          "offline://files/8daa1a0a/2d0aa938/1a96284d",
          "offline://files/8daa1a0a/2d0aa938/1a96284e",
          "offline://files/8daa1a0a/2d0aa938/1a96284f",
          "offline://files/8daa1a0a/2d0aa938/1a962850",
          "offline://files/8daa1a0a/2d0aa938/1a962851",
        ],
      },
      {
        downloaded: 8,
        ep_id: "12341",
        ep_name: "Chapter 1",
        pages: [
          "offline://files/8daa1a0a/744a7df9/1a96284a",
          "offline://files/8daa1a0a/744a7df9/1a96284b",
          "offline://files/8daa1a0a/744a7df9/1a96284c",
          "offline://files/8daa1a0a/744a7df9/1a96284d",
          "offline://files/8daa1a0a/744a7df9/1a96284e",
          "offline://files/8daa1a0a/744a7df9/1a96284f",
          "offline://files/8daa1a0a/744a7df9/1a962850",
          "offline://files/8daa1a0a/744a7df9/1a962851",
        ],
        path: "/manga-1/chap-1",
        start_download_at: 1,
      },
    ])
    ;(Date.now as ReturnType<typeof vi.fn>).mockReturnValue(0)
  })

  test("should delete manga", async () => {
    await createTaskDownloadEpisode(metaManga, metaEp).start()

    await expect(exists(`meta/${hashIDManga}`)).resolves.toBeTruthy()
    await expect(exists(`poster/${hashIDManga}`)).resolves.toBeTruthy()
    await expect(exists(`files/${hashIDManga}`)).resolves.toBeTruthy()

    await deleteManga(manga_id)

    await expect(exists(`meta/${hashIDManga}`)).resolves.toBeFalsy()
    await expect(exists(`poster/${hashIDManga}`)).resolves.toBeFalsy()
    await expect(exists(`files/${hashIDManga}`)).resolves.toBeFalsy()
  })

  test("should delete episode", async () => {
    await createTaskDownloadEpisode(metaManga, metaEp).start()
    await createTaskDownloadEpisode(metaManga, {
      ...metaEp,
      ep_id: metaEp.ep_id + 1,
    }).start()

    await expect(exists(`meta/${hashIDManga}`)).resolves.toBeTruthy()
    await expect(exists(`poster/${hashIDManga}`)).resolves.toBeTruthy()
    await expect(exists(`files/${hashIDManga}`)).resolves.toBeTruthy()

    await expect(
      exists(`meta/${hashIDManga}/${hashIDEp}.mod`),
    ).resolves.toBeTruthy()
    await expect(
      exists(`files/${hashIDManga}/${hashIDEp}`),
    ).resolves.toBeTruthy()

    const hashIDEp2 = hashSum(metaEp.ep_id + 1)
    await expect(
      exists(`meta/${hashIDManga}/${hashIDEp2}.mod`),
    ).resolves.toBeTruthy()
    await expect(
      exists(`files/${hashIDManga}/${hashIDEp2}`),
    ).resolves.toBeTruthy()

    await deleteEpisode(manga_id, ep_id)

    await expect(
      exists(`meta/${hashIDManga}/${hashIDEp}.mod`),
    ).resolves.toBeFalsy()
    await expect(
      exists(`files/${hashIDManga}/${hashIDEp}`),
    ).resolves.toBeFalsy()
    await expect(
      exists(`meta/${hashIDManga}/${hashIDEp2}.mod`),
    ).resolves.toBeTruthy()
    await expect(
      exists(`files/${hashIDManga}/${hashIDEp2}`),
    ).resolves.toBeTruthy()

    await deleteEpisode(manga_id, ep_id + 1)

    await expect(exists(`meta/${hashIDManga}.mod`)).resolves.toBeFalsy()
    await expect(exists(`poster/${hashIDManga}`)).resolves.toBeFalsy()
    await expect(exists(`files/${hashIDManga}`)).resolves.toBeFalsy()
  })
})

export {}
