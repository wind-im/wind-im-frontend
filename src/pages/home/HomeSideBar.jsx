import Link from 'next/link'
import { useQuery } from 'react-query'
import axios from '@/utils/axiosUtils'
import { getWhoami } from '@/utils/apiUtils'
import Avatar from '@/components/Avatar'
import { useRouter } from 'next/router'

export default function HomeSideBar() {
  return (
    <div className="p-5 shrink-0 flex flex-col h-full w-64 border-r-[1px] border-solid border-r-[#323437] overflow-y-hidden">
      <UserInfoPanel />
      <FriendPanel/>
      <DirectMsgPanel/>
    </div>
  )
}

function UserInfoPanel() {
  const { isLoading, data, error } = useQuery({ queryKey: 'getWhoami', queryFn: getWhoami, retry: 0 })
  if (error && error.response?.status == 403) {
    console.log('go to login page.')
    window.location.replace("/entry/login");
    // router.push("/entry/login")
  }
  return (
    <div className="text-[#e6eaf0] text-xl font-bold flex items-center space-x-2">
      {isLoading && <p>Anonymous</p>}
      {data && <Avatar username={data.data?.username} />}
      {data && <p>{data.data?.username}#{data.data?.tag}</p>}
    </div>
  )
}

function FriendPanel() {
  const router = useRouter()
  function isCurrActive(currLink) {
    return router.asPath == currLink
  }

  function FriendSelection({ icon, name, cnt, to }) {
    return (
      <div>
        <Link href={to}>
          <div className={`text-gray-400 p-1 rounded-md hover:bg-[#3b3c3f] hover:cursor-pointer ${isCurrActive(to) ? 'bg-[#3b3c3f]' : ''}`}>{name}</div>
        </Link>
      </div>
    )
  }

  return (
    <div className='mt-3'>
      <p className='text-[#e6eaf0] text-sm mt-2'>FRIENDS</p>
      <div className='ml-4 mt-1 flex flex-col space-y-1'>
        <FriendSelection name='All' to='/home/friend/all' />
        <FriendSelection name='Online' to='/home/friend/online' />
        <FriendSelection name='Pending' to='/home/friend/pending' />
      </div>
    </div>
  )
}

async function getPrivateMsg() {
  const result = await axios.get('/api/msg/privateMsgList')
  return result.data
}

function DirectMsgPanel() {
  const router = useRouter()
  function isCurrActive(currLink) {
    return router.asPath == currLink
  }

  function DirectMsgSelection({ icon, name, cnt, to }) {
    return (
      <div>
        <Link href={to}>
          <div className={`text-gray-400 p-1 rounded-md hover:bg-[#3b3c3f] hover:cursor-pointer ${isCurrActive(to) ? 'bg-[#3b3c3f]' : ''}`}>{name}</div>
        </Link>
      </div>
    )
  }

  const { error, isLoading, data } = useQuery('getPrivateMsg', getPrivateMsg)
  return (
    <div className='mt-3'>
      <p className='text-[#e6eaf0] text-sm mt-2'>DIRECT MESSAGES</p>
      <div className='ml-4 mt-1 flex flex-col space-y-1'>
        {data && data.data?.map(pm => {
          return <DirectMsgSelection key={pm.id} name={pm.msgTitle} to={`/home/directMessage/${pm.id}`} />
        })}
      </div>
    </div>
  )
}
