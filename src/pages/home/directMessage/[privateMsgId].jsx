import { useRouter } from 'next/router'
import { io } from 'socket.io-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import HomeLayout from '../HomeLayout'
import EmojiPicker from 'emoji-picker-react'
import { useQuery } from 'react-query'
import Avatar from '@/components/Avatar'
import { getPrivateMsgByOffset, getPrivateMsgInfo, getWhoami } from '@/utils/apiUtils'
import Layout from '@/pages/Layout'
import { getDMfromLocalStorage, getLatestStoredDMOffset, storeDirectMsg } from '@/utils/msgUtils'

// todo implement client side msg storage with offset

const defaultRetryTimes = 3

let socket

DirectMessage.getLayout = function getLayout(page) {
  return (
    <Layout>
      <HomeLayout>{page}</HomeLayout>
    </Layout>
  )
}

function buildPrivateMsgEvent(privateMsgId) {
  return 'privateMsgEvent_' + privateMsgId
}

function buildInitPrivateMsgEvent(privateMsgId) {
  return 'privateMsgInitEvent_' + privateMsgId
}

// component entry point
export default function DirectMessage() {
  const { isLoading, data, error } = useQuery('whoami', getWhoami)
  const router = useRouter()
  const { privateMsgId } = router.query
  const privateMsgInfo = useQuery(['getPrivateMsgInfo', privateMsgId], () => getPrivateMsgInfo(privateMsgId))
  const [currMsgList, setCurrMsgList] = useState([])
  const $msgInput = useRef()
  useWs(privateMsgId, setCurrMsgList)
  const [loadEmojiKeyboard, setLoadEmojiKeyboard] = useState(false)
  // msg part
  // todo: slow down request speed
  const [msgOffset, setMsgOffset] = useState(-1)
  const [hasMore, setHasMore] = useState(true)
  const queryPrivateMsg = useQuery(['privateMsgByOffset', privateMsgId, msgOffset],
    () => getPrivateMsgByOffset(privateMsgId, msgOffset))

  // init effect
  useEffect(() => {
    // initiate input
    cleanInputMsg()
    // clean offset
    setMsgOffset(-1)
    // initiate currMsgList
    setCurrMsgList([])
    scrollToEnd()
    return () => setCurrMsgList([])
  }, [privateMsgId])

  useEffect(() => {
    if (privateMsgId && queryPrivateMsg.data != null) {
      // console.log("msgId:", privateMsgId, "offset:", msgOffset,
      //   "data by offset", JSON.stringify(queryPrivateMsg.data.data))
      const newMsgList = queryPrivateMsg.data.data
      if (newMsgList == null || newMsgList.length == 0) {
        setHasMore(false)
      } else {
        // mark the msg offset
        // msgOffset.current = newMsgList[newMsgList.length - 1].id
        setHasMore(true)
        const msgListReversed = [...newMsgList].reverse()
        renderMsg(msgListReversed, setCurrMsgList, msgOffset == -1)
      }
    }
  }, [privateMsgId, msgOffset, queryPrivateMsg.data])

  // infinite scroll (reverse)
  const msgObserver = useRef()
  const lastPrivateMsgNodeRef = useCallback(node => {
    if (queryPrivateMsg.isLoading) {
      return
    }
    if (msgObserver.current != null) {
      msgObserver.current.disconnect()
    }
    msgObserver.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        // todo fix duplicate
        const currViewMsg = entries[0].target
        scrollToHeight(currViewMsg)
        const nextOffset = currViewMsg.getAttribute("msgid")
        setMsgOffset(nextOffset)
      }
    })
    if (node) {
      msgObserver.current.observe(node)
    }
  }, [queryPrivateMsg.isLoading, hasMore])

  function onKeyDownMessaging(e) {
    if (e.nativeEvent.isComposing) {
      // handle chinese keyboard composing
      return
    }
    if (e.code != 'Enter' || !privateMsgId) {
      return
    }
    const msgInput = $msgInput.current.value
    if (!msgInput || msgInput.length > 5000) {
      console.log('invalid input:' + msgInput)
      return
    }
    const whoami = data?.data?.username || 'Yourself'
    const msg2Send = {
      content: msgInput,
      senderUsername: whoami,
      ext: { retryTimes: defaultRetryTimes }
    }
    cleanInputMsg()
    emitMessage(msg2Send)
  }

  // At least once message arrival
  function emitMessage(msg) {
    if (msg.ext?.retryTimes < 0) {
      console.log('Ran out of retry times.')
      return
    }
    if (socket && socket.connected) {
      const privateMsgEvent = buildPrivateMsgEvent(privateMsgId)
      // guaranteeing msg won't miss with ack mechanism
      socket.timeout(2000).emit(privateMsgEvent, msg, (err, resp) => {
        if (err) {
          // retry sending msg, cuz the other side did not acknowledge the event in the given delay
          console.log('emit error, going to retry, e=' + JSON.stringify(err))
          msg.ext.retryTimes--
          emitMessage(msg)
        } else {
          const persistedMsgId = resp.sentMsg?.id
          msg.id = persistedMsgId
          renderMsg(msg, setCurrMsgList, true)
        }
      })
    }
  }

  function cleanInputMsg() {
    if ($msgInput.current) {
      $msgInput.current.value = ''
    }
  }

  function onClickEmoji(emojiOjb) {
    $msgInput.current.value += emojiOjb.emoji
  }

  return (
    <div className='p-3 w-full h-full flex flex-col overflow-hidden'>
      <div className='space-y-3 p-2 border-b-[1px] border-solid border-b-[#323437] text-white shrink-0'>
        <p className='font-bold text-2xl'>{privateMsgInfo?.data?.data?.msgTitle}</p>
        {/* <p className='text-white'>msgId: {privateMsgId}</p> */}
        <p className='text-[#717579]'>Direct message with {privateMsgInfo?.data?.data?.msgTitle}</p>
      </div>
      <div id="msgScroll" className=' overflow-y-scroll scrollbar h-full my-3'>
        {/* <SingleMsg className='text-white' content={'test msg'} email={'unsetEmail'}/>
          <SingleMsg className='text-white' content={'test msg'} email={'unsetEmail'}/> */}
        {queryPrivateMsg.isLoading && <div className='h-20 text-white'>msg loading...</div>}
        {currMsgList.map((m, idx) => {
          if (idx == 0) {
            return <SingleMsg msgRef={lastPrivateMsgNodeRef} className='text-white'
              key={m.id} content={m.content} msgId={m.id}
              username={m.senderUsername} />
          } else {
            return <SingleMsg className='text-white' key={m.id} content={m.content}
              msgId={m.id}
              username={m.senderUsername} />
          }
        })}
      </div>
      <div className='fixed right-20 bottom-32'>{loadEmojiKeyboard && <EmojiPicker searchDisabled={true} theme='dark' emojiStyle='native' onEmojiClick={onClickEmoji} />}
      </div>
      <div className='flex items-center'>
        <input className='break-all h-14 w-full px-10 py-4 rounded-2xl text-white bg-[#36383e]'
          ref={$msgInput} onKeyDown={onKeyDownMessaging} />
        <button className='w-10 h-10' onClick={() => setLoadEmojiKeyboard(!loadEmojiKeyboard)}>😊</button>
      </div>
    </div>
  )
}

function SingleMsg({ username, content, msgRef, msgId }) {
  return (
    <>
      <div msgid={msgId} ref={msgRef} className='flex mx-2 p-3 text-white rounded-lg hover:bg-[#323437] duration-300 ease-linear'>
        {/* <img className='w-12 h-12 bg-white rounded-full' src="https://avatars.githubusercontent.com/u/33996345?v=4" alt="" /> */}
        <Avatar username={username} />
        <div className='flex flex-col items-start mx-2'>
          <p className='font-bold'>{username}</p>
          <p className={'break-all '}>{content}</p>
        </div>
      </div>
    </>
  )
}

// render the msg panel
function saveAndRenderMsg(newMsg, setCurrMsgList, privateMsgId) {
  if (newMsg == null || privateMsgId == null) {
    return
  }
  // store msg to localStorage
  storeDirectMsg(privateMsgId, newMsg)
  // render msg to screen
  renderMsg(newMsg, setCurrMsgList, true)
}

function renderMsg(newMsg, setCurrMsgList, needScroll) {
  if (newMsg == null) {
    return
  }
  if (Array.isArray(newMsg)) {
    // multiple msg, history msg
    setCurrMsgList((currMsgList) => {
      return [...newMsg, ...currMsgList]
    })
  } else {
    // single msg, new msg
    setCurrMsgList((currMsgList) => {
      return [...currMsgList, newMsg]
    })
  }
  if (needScroll) {
    scrollToEnd()
  }
}

function scrollToEnd() {
  // wait for next tick
  setTimeout(() => {
    const msgScrollElement = document.getElementById('msgScroll')
    console.log("scroll bottom:", msgScrollElement.scrollHeight)
    msgScrollElement.scrollTo(0, msgScrollElement.scrollHeight)
  }, 0)
}

function scrollToHeight(node) {
  // wait for next tick
  setTimeout(() => {
    const msgScrollElement = document.getElementById('msgScroll')
    console.log("scroll height:", node.scrollHeight)
    msgScrollElement?.scrollTo(0, node.scrollHeight)
  }, 0)
}

function useWs(privateMsgId, setCurrMsgList) {
  useEffect(() => {
    const msgOffset = getLatestStoredDMOffset(privateMsgId)
    if (privateMsgId) {
      socket = io(process.env.NEXT_PUBLIC_WS_HOST, {
        withCredentials: true, // send cookies
        transports: ['websocket'],
        query: {
          privateMsgId,
          privateMsgOffset: msgOffset
        }
      })

      socket.on('connect', () => {
        console.log(privateMsgId + ' connected.')
      })

      socket.on('disconnect', () => {
        console.log(privateMsgId + ' disconnected.')
      })

      // on initiating & receiving private msg
      const privateMsgEvent = buildPrivateMsgEvent(privateMsgId)
      // const privateMsgInitEvent = buildInitPrivateMsgEvent(privateMsgId)
      socket.on(privateMsgEvent, function(msg) {
        saveAndRenderMsg(msg, setCurrMsgList, privateMsgId)
      })
      // socket.on(privateMsgInitEvent, function (msgList) {
      //   // init msg from localStorage
      //   const cachedMsg = getDMfromLocalStorage(privateMsgId)
      //   renderMsg(cachedMsg, setCurrMsgList, privateMsgId)
      //   // render the rest of missing messages
      //   saveAndRenderMsg(msgList, setCurrMsgList, privateMsgId)
      // })
    }
    return () => { socket?.disconnect() }
  }, [privateMsgId])
}
